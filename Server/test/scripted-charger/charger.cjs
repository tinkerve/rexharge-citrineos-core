#!/usr/bin/env node
// Scripted OCPP 1.6 charger for the local rig (REX-96).
//
// Drives a real CitrineOS (API, OCPP 1.6 websocket, RabbitMQ, Postgres) through charging sessions,
// then checks what the charger received, what CitrineOS wrote to Postgres and which RabbitMQ queues
// exist for the station.
//
// Usage: node Server/test/scripted-charger/charger.cjs <scenario>
//
//   ctrl         Reply Accepted to RemoteStop, wait 1 s, then StopTransaction (no overlap).
//   late         On RemoteStop, send StopTransaction BEFORE replying (the CSMS call is still open).
//   prod         Reply Accepted, fire a 2nd RemoteStop at once; send StopTransaction as soon as that
//                duplicate arrives (so the CSMS call is open) and answer it Rejected 150 ms later.
//                The 2026-11-21 MyTown incident order: the duplicate took the station lock 4 ms
//                before StopTransaction arrived. Both RemoteStops have their own message id, so
//                the charger must receive both.
//   overlap      A second socket for the station connects while the first is still open; the first
//                socket dies only after the second registered (its close event fires late). Expect
//                one connection's queues, the station online, a RemoteStop received once, and a
//                clean teardown on the final disconnect.
//   dup-open     The RemoteStop delivery is published to RabbitMQ a second time (same message id)
//                while the first copy is still waiting for the charger's answer.
//   dup-answered The same, but the copy is published 3 ms after the charger answered the first
//                (the incident's timing). In both, the charger must receive RemoteStop once.
//   orphan       Start a transaction, report the connector Available, never send StopTransaction.
//                After the orphan timeout the transaction is inactive with stoppedReason Other and
//                an end time, and a new StartTransaction with the same idTag is Accepted.
//   orphan-stop  As orphan, but StopTransaction arrives before the timeout: the transaction closes
//                normally and the orphan close does not overwrite it.
//
// Exit code 0 = scenario passed, 1 = assertion failed, 2 = timeout / connection error.
//
// Environment (defaults match README.md):
//   CITRINE_API      http://localhost:18080
//   CITRINE_WS       ws://localhost:18092
//   STATION          testing
//   TENANT_ID        1
//   IDTAG            random per run (a token with no open transaction)
//   DATABASE_URL     postgres://citrine:citrine@localhost:15433/citrine
//   AMQP_URL         amqp://guest:guest@localhost:5672
//   AMQP_EXCHANGE    citrineos
//   RABBIT_MGMT      http://guest:guest@localhost:15672
//   ORPHAN_WAIT_MS   how long the orphan scenarios wait after Available (default 15000; the rig
//                    config sets the CitrineOS orphan timeout to 10 s)
const path = require('path');
const crypto = require('crypto');

const repoRoot = path.resolve(__dirname, '../..', '..');
const need = (m) => require(require.resolve(m, { paths: [repoRoot] }));
const WebSocket = need('ws');
const { Client } = need('pg');
const amqplib = need('amqplib');

const SCENARIOS = [
  'ctrl',
  'late',
  'prod',
  'overlap',
  'dup-open',
  'dup-answered',
  'orphan',
  'orphan-stop',
  'orphan-skew',
  'orphan-old',
  'orphan-201',
  'orphan-plugin',
  'orphan-next',
  'triple',
];
const scenario = process.argv[2] || 'late';
if (!SCENARIOS.includes(scenario)) {
  console.error(`unknown scenario "${scenario}", expected one of ${SCENARIOS.join(', ')}`);
  process.exit(2);
}
const API = process.env.CITRINE_API || 'http://localhost:18080';
const WS = process.env.CITRINE_WS || 'ws://localhost:18092';
const STATION = process.env.STATION || 'testing';
const TENANT_ID = Number(process.env.TENANT_ID || 1);
const IDTAG = process.env.IDTAG || `RIG${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
// The next driver's card, for the scenarios where someone else plugs in after a lost stop.
const NEXT_IDTAG = `${IDTAG}N`;
const DATABASE_URL =
  process.env.DATABASE_URL || 'postgres://citrine:citrine@localhost:15433/citrine';
const AMQP_URL = process.env.AMQP_URL || 'amqp://guest:guest@localhost:5672';
const AMQP_EXCHANGE = process.env.AMQP_EXCHANGE || 'citrineos';
const RABBIT_MGMT = new URL(process.env.RABBIT_MGMT || 'http://guest:guest@localhost:15672');
const ORPHAN_WAIT_MS = Number(process.env.ORPHAN_WAIT_MS || 18000);

const t0 = Date.now();
const log = (...a) => console.log(`[${String(Date.now() - t0).padStart(5)}ms]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Charger clock offset; the orphan-skew scenario runs the charger 8 h ahead of the server.
let clockSkewMs = 0;
const now = () => new Date(Date.now() + clockSkewMs).toISOString();

const failures = [];
const expect = (ok, what) => {
  log(ok ? 'PASS' : 'FAIL', what);
  if (!ok) failures.push(what);
};

// ─── A scripted charger connection ──────────────────────────────────────────

class Charger {
  constructor(name) {
    this.name = name;
    this.pending = new Map();
    this.remoteStops = []; // [messageId, payload] of every RemoteStopTransaction received
    this.onRemoteStop = async (id) => this.reply(id, { status: 'Accepted' });
  }

  connect() {
    this.ws = new WebSocket(`${WS}/${STATION}`, ['ocpp1.6']);
    this.closed = new Promise((res) => this.ws.on('close', res));
    this.ws.on('error', (e) => log(`[${this.name}] ws error`, e.message));
    this.ws.on('message', (raw) => this._onMessage(JSON.parse(raw.toString())));
    return new Promise((res, rej) => {
      this.ws.once('open', () => {
        log(`[${this.name}] connected as ${STATION}`);
        res();
      });
      this.ws.once('error', rej);
    });
  }

  _onMessage(m) {
    if (m[0] === 3 || m[0] === 4) {
      const p = this.pending.get(m[1]);
      this.pending.delete(m[1]);
      log(
        `[${this.name}] CSMS -> CS`,
        m[0] === 3 ? 'CALLRESULT' : 'CALLERROR',
        p?.action,
        JSON.stringify(m.slice(2)),
      );
      p?.res(m);
      return;
    }
    const [, id, action, payload] = m;
    log(`[${this.name}] CSMS -> CS`, action, id, JSON.stringify(payload));
    if (action === 'RemoteStopTransaction') {
      this.remoteStops.push([id, payload]);
      this.onRemoteStop(id, payload);
    } else this.reply(id, {});
  }

  call(action, payload) {
    const id = crypto.randomUUID();
    log(`[${this.name}] CS -> CSMS`, action, JSON.stringify(payload));
    this.ws.send(JSON.stringify([2, id, action, payload]));
    // A call CitrineOS never answers resolves to null after 10 s, so a scenario reports a failure
    // instead of hanging.
    return new Promise((res) => {
      this.pending.set(id, { action, res });
      setTimeout(() => {
        if (this.pending.delete(id)) {
          log(`[${this.name}] no answer to ${action} within 10 s`);
          res(null);
        }
      }, 10000);
    });
  }

  reply(id, payload) {
    log(`[${this.name}] CS -> CSMS CALLRESULT`, id, JSON.stringify(payload));
    this.ws.send(JSON.stringify([3, id, payload]));
  }

  boot() {
    return this.call('BootNotification', { chargePointVendor: 'Rex96', chargePointModel: 'Rig' });
  }

  status(status, timestamp = now()) {
    return this.call('StatusNotification', {
      connectorId: 1,
      errorCode: 'NoError',
      status,
      timestamp,
    });
  }

  async start(idTag = IDTAG) {
    await this.status('Preparing');
    const st = await this.call('StartTransaction', {
      connectorId: 1,
      idTag,
      meterStart: 1000,
      timestamp: now(),
    });
    await this.status('Charging');
    log(`[${this.name}] StartTransaction ->`, JSON.stringify(st?.[2]));
    return st;
  }

  stop(transactionId) {
    return this.call('StopTransaction', {
      transactionId,
      idTag: IDTAG,
      meterStop: 6000,
      timestamp: now(),
      reason: 'Remote',
    });
  }

  close() {
    this.ws.close();
    return this.closed;
  }
}

// ─── Rig helpers: API, DB, RabbitMQ ─────────────────────────────────────────

async function remoteStop(tag, transactionId) {
  log(`API RemoteStop #${tag}`);
  const r = await fetch(
    `${API}/ocpp/1.6/evdriver/remoteStopTransaction?identifier=${STATION}&tenantId=${TENANT_ID}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ transactionId }),
    },
  );
  log(`API RemoteStop #${tag} ->`, r.status, await r.text());
}

async function withDb(fn) {
  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}

// A fresh rig DB knows neither the idTag nor connector 1 of the station. StartTransaction is only
// Accepted for a known idTag, and a transaction needs a Connector (with its Evse) to attach to.
// Run after BootNotification, which creates the ChargingStations row.
async function seed() {
  // The ChargingStations row is written while the connection registers; on a fresh database it can
  // land just after BootNotification is answered, so retry on the foreign key error.
  for (let attempt = 1; ; attempt++) {
    try {
      return await seedOnce();
    } catch (e) {
      if (attempt >= 20 || !/foreign key/.test(e.message)) throw e;
      await sleep(250);
    }
  }
}

function seedOnce() {
  return withDb(async (db) => {
    await db.query(
      `INSERT INTO "Evses" ("stationId", "evseTypeId", "tenantId", "createdAt", "updatedAt")
       SELECT $1::varchar, 1, $2::int, now(), now()
        WHERE NOT EXISTS (SELECT 1 FROM "Evses" WHERE "stationId" = $1::varchar AND "evseTypeId" = 1)`,
      [STATION, TENANT_ID],
    );
    await db.query(
      `INSERT INTO "Connectors" ("stationId", "connectorId", "evseId", "evseTypeConnectorId", "tenantId", "createdAt", "updatedAt")
       SELECT $1::varchar, 1, e.id, 1, $2::int, now(), now()
         FROM "Evses" e
        WHERE e."stationId" = $1::varchar AND e."evseTypeId" = 1
          AND NOT EXISTS (SELECT 1 FROM "Connectors" WHERE "stationId" = $1::varchar AND "connectorId" = 1)
        LIMIT 1`,
      [STATION, TENANT_ID],
    );
    for (const idTag of [IDTAG, NEXT_IDTAG]) {
      await db.query(
        `INSERT INTO "Authorizations" ("idToken", "idTokenType", status, "tenantId", "createdAt", "updatedAt")
         SELECT $1::varchar, 'Central', 'Accepted', $2::int, now(), now()
          WHERE NOT EXISTS (SELECT 1 FROM "Authorizations" WHERE "idToken" = $1::varchar AND "tenantId" = $2::int)`,
        [idTag, TENANT_ID],
      );
    }
  });
}

async function readTransaction(transactionId) {
  return withDb(async (db) => {
    const { rows } = await db.query(
      `SELECT t.id, t."isActive", t."stoppedReason", t."endTime", count(s.id)::int AS "stopRows"
         FROM "Transactions" t
         LEFT JOIN "StopTransactions" s ON s."transactionDatabaseId" = t.id
        WHERE t."transactionId" = $1 AND t."stationId" = $2 AND t."tenantId" = $3
        GROUP BY t.id`,
      [String(transactionId), STATION, TENANT_ID],
    );
    log('db transaction', JSON.stringify(rows[0]));
    return rows[0];
  });
}

async function readStationOnline() {
  return withDb(async (db) => {
    const { rows } = await db.query(
      `SELECT "isOnline" FROM "ChargingStations" WHERE id = $1 AND "tenantId" = $2`,
      [STATION, TENANT_ID],
    );
    log('db station isOnline', rows[0]?.isOnline);
    return rows[0]?.isOnline;
  });
}

// Queues the router created for this station: rabbit_queue_<tenantId>:<stationId>_<timestamp>.
async function stationQueues() {
  const auth = Buffer.from(
    `${decodeURIComponent(RABBIT_MGMT.username)}:${decodeURIComponent(RABBIT_MGMT.password)}`,
  ).toString('base64');
  const r = await fetch(`${RABBIT_MGMT.origin}/api/queues/%2F?columns=name,consumers`, {
    headers: { authorization: `Basic ${auth}` },
  });
  const prefix = `rabbit_queue_${TENANT_ID}:${STATION}_`;
  const names = (await r.json()).map((q) => q.name).filter((n) => n.startsWith(prefix));
  log('station queues', JSON.stringify(names));
  return names;
}

// One connection subscribes twice (requests, responses); the two queues are named by creation time
// in ms and may share a name. A set belongs to one connection when it has 1-2 queues created within
// a second of each other; a leftover of an earlier socket is seconds older.
function isOneConnectionsQueues(names) {
  const times = names.map((n) => Number(n.split('_').pop()));
  return names.length >= 1 && names.length <= 2 && Math.max(...times) - Math.min(...times) < 1000;
}

// Taps the CSMS -> station request deliveries on the broker, so a scenario can publish the same
// delivery a second time (the duplicate delivery of the incident).
async function tapStationRequests() {
  const conn = await amqplib.connect(AMQP_URL);
  const channel = await conn.createChannel();
  const { queue } = await channel.assertQueue('', { exclusive: true, autoDelete: true });
  await channel.bindQueue(queue, AMQP_EXCHANGE, '', {
    'x-match': 'all',
    tenantId: String(TENANT_ID),
    stationId: STATION,
    state: '1', // MessageState.Request
  });
  const captured = [];
  let onCapture = () => {};
  await channel.consume(
    queue,
    (msg) => {
      captured.push(msg);
      onCapture(msg);
    },
    { noAck: true },
  );
  return {
    captured,
    next: () => new Promise((res) => (onCapture = res)),
    republish: (msg) => {
      log('broker: publishing the same delivery again', msg.properties.headers?.action);
      channel.publish(AMQP_EXCHANGE, '', msg.content, msg.properties);
    },
    close: () => conn.close(),
  };
}

// ─── Scenarios ──────────────────────────────────────────────────────────────

async function bootAndStart(charger) {
  await charger.connect();
  await charger.boot();
  await seed();
  const st = await charger.start();
  return st?.[2]?.transactionId;
}

async function expectClosedNormally(transactionId, stopReply) {
  expect(
    stopReply && stopReply[0] === 3,
    `StopTransaction answered with CALLRESULT (got ${JSON.stringify(stopReply)})`,
  );
  await sleep(1000); // let CitrineOS finish writing the StopTransaction
  const tx = await readTransaction(transactionId);
  expect(!!tx, `Transactions row exists for transactionId ${transactionId}`);
  expect(tx && tx.isActive === false, 'transaction is inactive');
  expect(tx && tx.stopRows === 1, 'exactly one StopTransactions row');
  return tx;
}

async function remoteStopScenario(mode) {
  const cs = new Charger('cs');
  const txId = await bootAndStart(cs);
  let stopReply;
  let duplicateArrived;
  const duplicate = new Promise((res) => (duplicateArrived = res));
  const done = new Promise((resolve) => {
    cs.onRemoteStop = async (id) => {
      if (cs.remoteStops.length > 1) {
        duplicateArrived();
        await sleep(150);
        return cs.reply(id, { status: 'Rejected' }); // charger already stopping
      }
      if (mode === 'late') {
        const stopP = cs.stop(txId);
        await sleep(300);
        cs.reply(id, { status: 'Accepted' });
        stopReply = await stopP;
      } else if (mode === 'prod') {
        cs.reply(id, { status: 'Accepted' });
        remoteStop(2, txId); // the duplicate send, fired at once
        await Promise.race([duplicate, sleep(3000)]);
        stopReply = await cs.stop(txId);
      } else {
        cs.reply(id, { status: 'Accepted' });
        await sleep(1000);
        stopReply = await cs.stop(txId);
      }
      resolve();
    };
  });
  await sleep(1500);
  remoteStop(1, txId);
  await done;
  await sleep(1500);
  await cs.close();
  await expectClosedNormally(txId, stopReply);
  if (mode === 'prod') {
    expect(
      cs.remoteStops.length === 2,
      `both RemoteStops (different message ids) reached the charger (got ${cs.remoteStops.length})`,
    );
  }
}

async function overlapScenario() {
  const first = new Charger('first');
  await first.connect();
  await first.boot();
  await seed();
  await sleep(500);

  // The charger reconnects while the server still holds the first socket.
  const second = new Charger('second');
  await second.connect();
  await second.boot();
  await sleep(500);
  // Only now does the first socket die, so its close event fires after the second registered.
  log('[first] terminating the old socket');
  first.ws.terminate();
  await sleep(1500);

  const queues = await stationQueues();
  expect(
    isOneConnectionsQueues(queues),
    `station has one connection's queues (got ${JSON.stringify(queues)})`,
  );
  expect((await readStationOnline()) === true, 'station isOnline=true after the reconnect');

  const st = await second.start();
  const txId = st?.[2]?.transactionId;
  let stopReply;
  second.onRemoteStop = async (id) => {
    second.reply(id, { status: 'Accepted' });
    if (second.remoteStops.length === 1) {
      await sleep(500);
      stopReply = await second.stop(txId);
    }
  };
  await remoteStop(1, txId);
  await sleep(2500);
  expect(
    second.remoteStops.length === 1,
    `RemoteStop received once (got ${second.remoteStops.length})`,
  );
  expect(first.remoteStops.length === 0, 'old socket received nothing');
  await expectClosedNormally(txId, stopReply);

  // A normal disconnect still tears everything down.
  await second.close();
  await sleep(1500);
  expect((await stationQueues()).length === 0, 'normal disconnect deletes the station queues');
  expect((await readStationOnline()) === false, 'normal disconnect marks the station offline');
}

async function duplicateDeliveryScenario(mode) {
  const tap = await tapStationRequests();
  try {
    const cs = new Charger('cs');
    const txId = await bootAndStart(cs);
    let stopReply;
    let answered;
    const answeredP = new Promise((res) => (answered = res));
    cs.onRemoteStop = async (id) => {
      if (cs.remoteStops.length > 1) return cs.reply(id, { status: 'Rejected' });
      await sleep(mode === 'dup-open' ? 500 : 0);
      cs.reply(id, { status: 'Accepted' });
      answered();
      await sleep(1000);
      stopReply = await cs.stop(txId);
    };
    const firstDelivery = tap.next();
    await sleep(500);
    await remoteStop(1, txId);
    const msg = await firstDelivery;
    if (mode === 'dup-open') {
      tap.republish(msg); // the first copy is still waiting for the charger's answer
    } else {
      await answeredP;
      await sleep(3);
      tap.republish(msg); // 3 ms after the charger answered the first copy
    }
    await sleep(4000);
    expect(
      cs.remoteStops.length === 1,
      `charger received RemoteStop once (got ${cs.remoteStops.length}: ${JSON.stringify(cs.remoteStops.map((r) => r[0]))})`,
    );
    await cs.close();
    await expectClosedNormally(txId, stopReply);
  } finally {
    await tap.close();
  }
}

async function orphanScenario(mode) {
  if (mode === 'orphan-skew') clockSkewMs = 8 * 3600 * 1000; // charger clock 8 h ahead
  const excluded = mode === 'orphan-old' || mode === 'orphan-201';
  const cs = new Charger('cs');
  const txId = await bootAndStart(cs);
  if (mode === 'orphan-old') {
    // A transaction CitrineOS created 25 h ago: older than orphanTransactionMaxAgeHours (24).
    await withDb((db) =>
      db.query(
        `UPDATE "Transactions" SET "createdAt" = now() - interval '25 hours'
          WHERE "transactionId" = $1 AND "stationId" = $2`,
        [String(txId), STATION],
      ),
    );
  }
  if (mode === 'orphan-201') {
    // The closer only handles OCPP 1.6 stations.
    await setStationProtocol('ocpp2.0.1');
  }
  await sleep(500);
  // The charger stops and the cable is unplugged, but its StopTransaction never reaches CitrineOS.
  await cs.status('Finishing');
  const firstAvailableAt = now();
  await cs.status('Available', firstAvailableAt);
  let stopReply;
  if (mode === 'orphan-stop') {
    await sleep(2000);
    stopReply = await cs.stop(txId); // a late but in-time StopTransaction
    await sleep(ORPHAN_WAIT_MS - 2000);
  } else {
    // Firmware that re-sends Available (e.g. after a reconnect) must not restart the window.
    await sleep(6000);
    await cs.status('Available');
    log(`waiting for the orphan timeout`);
    await sleep(ORPHAN_WAIT_MS - 6000);
  }

  if (mode === 'orphan-stop') {
    const tx = await expectClosedNormally(txId, stopReply);
    expect(
      tx && tx.stoppedReason !== 'Other',
      `orphan close did not fire (stoppedReason ${tx?.stoppedReason})`,
    );
  } else if (excluded) {
    const tx = await readTransaction(txId);
    expect(tx && tx.isActive === true, `${mode}: transaction left active (out of scope)`);
    if (mode === 'orphan-201') await setStationProtocol('ocpp1.6');
    const stop = await cs.stop(txId);
    expect(stop?.[0] === 3, 'clean-up StopTransaction answered');
    await cs.close();
    return;
  } else {
    const tx = await readTransaction(txId);
    expect(tx && tx.isActive === false, 'orphaned transaction is inactive');
    expect(tx && tx.stoppedReason === 'Other', `stoppedReason is Other (got ${tx?.stoppedReason})`);
    expect(
      tx && tx.endTime && new Date(tx.endTime).getTime() === new Date(firstAvailableAt).getTime(),
      `end time is the charger time of the first Available ${firstAvailableAt} (got ${tx?.endTime && new Date(tx.endTime).toISOString()})`,
    );
    expect(tx && tx.stopRows === 0, 'no StopTransactions row was invented');
  }

  // The driver's next session with the same card.
  const next = await cs.start();
  expect(
    next?.[2]?.idTagInfo?.status === 'Accepted',
    `next StartTransaction with the same idTag is Accepted (got ${next?.[2]?.idTagInfo?.status})`,
  );
  const stop = await cs.stop(next?.[2]?.transactionId);
  expect(stop?.[0] === 3, 'next session stops normally');
  await cs.close();
}

function setStationProtocol(protocol) {
  return withDb((db) =>
    db.query(`UPDATE "ChargingStations" SET protocol = $1 WHERE id = $2 AND "tenantId" = $3`, [
      protocol,
      STATION,
      TENANT_ID,
    ]),
  );
}

// The charger loses the StopTransaction, the cable is unplugged, and the next driver plugs in
// before the orphan timeout. orphan-plugin: the next driver only plugs in (connector Preparing);
// the old transaction must still close when the timeout passes. orphan-next: the next driver starts
// a session; the old transaction must close at once and the new one start normally.
async function nextDriverScenario(mode) {
  const cs = new Charger('cs');
  const txId = await bootAndStart(cs);
  await sleep(500);
  await cs.status('Finishing');
  const firstAvailableAt = now();
  await cs.status('Available', firstAvailableAt);
  await sleep(3000);
  if (mode === 'orphan-plugin') {
    await cs.status('Preparing'); // next driver plugs in, has not started yet
    log('waiting for the orphan timeout with the connector Preparing');
    await sleep(ORPHAN_WAIT_MS - 3000);
    const tx = await readTransaction(txId);
    expect(
      tx && tx.isActive === false,
      'old transaction is inactive although the connector is Preparing',
    );
    expect(tx && tx.stoppedReason === 'Other', `stoppedReason is Other (got ${tx?.stoppedReason})`);
    expect(
      tx && tx.endTime && new Date(tx.endTime).getTime() === new Date(firstAvailableAt).getTime(),
      `end time is the first Available ${firstAvailableAt} (got ${tx?.endTime && new Date(tx.endTime).toISOString()})`,
    );
    const next = await cs.start(NEXT_IDTAG);
    expect(next?.[2]?.idTagInfo?.status === 'Accepted', 'next driver starts normally');
    await cs.stop(next?.[2]?.transactionId);
  } else {
    const next = await cs.start(NEXT_IDTAG); // well before the timeout
    const nextTxId = next?.[2]?.transactionId;
    expect(next?.[2]?.idTagInfo?.status === 'Accepted', 'next driver starts normally');
    await sleep(1000);
    const old = await readTransaction(txId);
    expect(old && old.isActive === false, 'old transaction closed as soon as the new one started');
    expect(
      old && old.stoppedReason === 'Other',
      `stoppedReason is Other (got ${old?.stoppedReason})`,
    );
    expect(
      old &&
        old.endTime &&
        new Date(old.endTime).getTime() === new Date(firstAvailableAt).getTime(),
      `end time is the first Available ${firstAvailableAt} (got ${old?.endTime && new Date(old.endTime).toISOString()})`,
    );
    const current = await readTransaction(nextTxId);
    expect(current && current.isActive === true, 'new transaction stays active');
    const stop = await cs.stop(nextTxId);
    await expectClosedNormally(nextTxId, stop);
  }
  await cs.close();
}

// A charger that reconnects in a tight loop: three sockets for the station open at once.
async function tripleScenario() {
  const probe = new Charger('probe');
  await probe.connect();
  await probe.boot();
  await seed();
  await sleep(500);
  await probe.close();
  await sleep(1000);

  const sockets = [new Charger('a'), new Charger('b'), new Charger('c')];
  await Promise.all(sockets.map((c) => c.connect()));
  await sleep(3000);

  const open = sockets.filter((c) => c.ws.readyState === WebSocket.OPEN);
  expect(open.length === 1, `exactly one socket stays open (got ${open.length})`);
  const queues = await stationQueues();
  expect(
    isOneConnectionsQueues(queues),
    `station has one connection's queues (got ${JSON.stringify(queues)})`,
  );
  expect((await readStationOnline()) === true, 'station isOnline=true');
  if (open.length !== 1) return;

  const survivor = open[0];
  await survivor.boot();
  const st = await survivor.start();
  const txId = st?.[2]?.transactionId;
  let stopReply;
  survivor.onRemoteStop = async (id) => {
    survivor.reply(id, { status: 'Accepted' });
    if (survivor.remoteStops.length === 1) {
      await sleep(500);
      stopReply = await survivor.stop(txId);
    }
  };
  await remoteStop(1, txId);
  await sleep(2500);
  expect(
    survivor.remoteStops.length === 1,
    `RemoteStop received once (got ${survivor.remoteStops.length})`,
  );
  await expectClosedNormally(txId, stopReply);
  await survivor.close();
  await sleep(1500);
  expect((await stationQueues()).length === 0, 'final disconnect deletes the station queues');
}

const RUN = {
  ctrl: () => remoteStopScenario('ctrl'),
  late: () => remoteStopScenario('late'),
  prod: () => remoteStopScenario('prod'),
  overlap: overlapScenario,
  'dup-open': () => duplicateDeliveryScenario('dup-open'),
  'dup-answered': () => duplicateDeliveryScenario('dup-answered'),
  orphan: () => orphanScenario('orphan'),
  'orphan-stop': () => orphanScenario('orphan-stop'),
  'orphan-skew': () => orphanScenario('orphan-skew'),
  'orphan-old': () => orphanScenario('orphan-old'),
  'orphan-201': () => orphanScenario('orphan-201'),
  'orphan-plugin': () => nextDriverScenario('orphan-plugin'),
  'orphan-next': () => nextDriverScenario('orphan-next'),
  triple: tripleScenario,
};

const timer = setTimeout(
  () => {
    log('timeout');
    process.exit(2);
  },
  60000 + (scenario.startsWith('orphan') ? ORPHAN_WAIT_MS : 0),
);

log(`scenario ${scenario}, station ${STATION}, idTag ${IDTAG}`);
RUN[scenario]()
  .then(() => {
    clearTimeout(timer);
    log(failures.length ? `scenario ${scenario}: FAILED` : `scenario ${scenario}: PASSED`);
    process.exit(failures.length ? 1 : 0);
  })
  .catch((e) => {
    log('error', e);
    process.exit(2);
  });
