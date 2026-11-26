#!/usr/bin/env node
// Scripted OCPP 1.6 charger for the local rig (REX-96).
//
// Drives a real CitrineOS (API + OCPP 1.6 websocket) through a charging session and a remote stop,
// then checks what the charger received and what CitrineOS wrote to Postgres.
//
// Usage: node Server/test/scripted-charger/charger.cjs <scenario>
//   ctrl : reply Accepted to RemoteStop, wait 1 s, then StopTransaction (no overlap)
//   late : on RemoteStop, send StopTransaction BEFORE replying (CSMS call still open)
//   prod : reply Accepted, fire a 2nd RemoteStop at once; the charger sends StopTransaction as
//          soon as that duplicate RemoteStop arrives (so the CSMS call is open), and answers the
//          duplicate with Rejected 150 ms later. This is the 2026-11-21 MyTown incident order:
//          the duplicate took the station lock 4 ms before StopTransaction arrived.
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
const path = require('path');
const crypto = require('crypto');

const repoRoot = path.resolve(__dirname, '../..', '..');
const WebSocket = require(require.resolve('ws', { paths: [repoRoot] }));
const { Client } = require(require.resolve('pg', { paths: [repoRoot] }));

const scenario = process.argv[2] || 'late';
const SCENARIOS = ['ctrl', 'late', 'prod'];
if (!SCENARIOS.includes(scenario)) {
  console.error(`unknown scenario "${scenario}", expected one of ${SCENARIOS.join(', ')}`);
  process.exit(2);
}
const API = process.env.CITRINE_API || 'http://localhost:18080';
const WS = process.env.CITRINE_WS || 'ws://localhost:18092';
const STATION = process.env.STATION || 'testing';
const TENANT_ID = Number(process.env.TENANT_ID || 1);
const IDTAG = process.env.IDTAG || `RIG${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
const DATABASE_URL =
  process.env.DATABASE_URL || 'postgres://citrine:citrine@localhost:15433/citrine';

const t0 = Date.now();
const log = (...a) => console.log(`[${String(Date.now() - t0).padStart(5)}ms]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();

// What the charger saw, for the assertions at the end.
const received = { remoteStops: 0, stopTransactionReply: null };
const pending = new Map();
let duplicateRemoteStopArrived;
const duplicateRemoteStop = new Promise((res) => (duplicateRemoteStopArrived = res));
let ws;
let txId;

function call(action, payload) {
  const id = crypto.randomUUID();
  log('CS -> CSMS', action, JSON.stringify(payload));
  ws.send(JSON.stringify([2, id, action, payload]));
  return new Promise((res) => pending.set(id, { action, res }));
}

function reply(id, payload) {
  log('CS -> CSMS CALLRESULT', JSON.stringify(payload));
  ws.send(JSON.stringify([3, id, payload]));
}

async function remoteStop(tag) {
  log(`API RemoteStop #${tag}`);
  const r = await fetch(
    `${API}/ocpp/1.6/evdriver/remoteStopTransaction?identifier=${STATION}&tenantId=${TENANT_ID}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ transactionId: txId }),
    },
  );
  log(`API RemoteStop #${tag} ->`, r.status, await r.text());
}

async function stopTransaction() {
  const res = await call('StopTransaction', {
    transactionId: txId,
    idTag: IDTAG,
    meterStop: 6000,
    timestamp: now(),
    reason: 'Remote',
  });
  received.stopTransactionReply = res;
  return res;
}

async function onRemoteStop(id) {
  received.remoteStops++;
  if (received.remoteStops > 1) {
    duplicateRemoteStopArrived();
    await sleep(150);
    return reply(id, { status: 'Rejected' }); // charger already stopping
  }
  if (scenario === 'late') {
    const stopP = stopTransaction();
    await sleep(300);
    reply(id, { status: 'Accepted' });
    await stopP;
  } else if (scenario === 'prod') {
    reply(id, { status: 'Accepted' });
    remoteStop(2); // the duplicate send, fired at once
    await Promise.race([duplicateRemoteStop, sleep(3000)]);
    await stopTransaction();
  } else {
    reply(id, { status: 'Accepted' });
    await sleep(1000);
    await stopTransaction();
  }
  await sleep(1500);
  ws.close();
}

// A fresh rig DB knows neither the idTag nor connector 1 of the station. StartTransaction is only
// Accepted for a known idTag, and a transaction needs a Connector (with its Evse) to attach to.
// Run after BootNotification, which creates the ChargingStations row.
async function seed() {
  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();
  try {
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
    await db.query(
      `INSERT INTO "Authorizations" ("idToken", "idTokenType", status, "tenantId", "createdAt", "updatedAt")
       SELECT $1::varchar, 'Central', 'Accepted', $2::int, now(), now()
        WHERE NOT EXISTS (SELECT 1 FROM "Authorizations" WHERE "idToken" = $1::varchar AND "tenantId" = $2::int)`,
      [IDTAG, TENANT_ID],
    );
  } finally {
    await db.end();
  }
}

async function session() {
  ws = new WebSocket(`${WS}/${STATION}`, ['ocpp1.6']);
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m[0] === 3 || m[0] === 4) {
      const p = pending.get(m[1]);
      pending.delete(m[1]);
      log(
        'CSMS -> CS',
        m[0] === 3 ? 'CALLRESULT' : 'CALLERROR',
        p?.action,
        JSON.stringify(m.slice(2)),
      );
      p?.res(m);
      return;
    }
    const [, id, action, payload] = m;
    log('CSMS -> CS', action, JSON.stringify(payload));
    if (action === 'RemoteStopTransaction') onRemoteStop(id);
    else reply(id, {});
  });
  const closed = new Promise((res, rej) => {
    ws.on('close', res);
    ws.on('error', rej);
  });
  await new Promise((res, rej) => {
    ws.once('open', res);
    ws.once('error', rej);
  });
  log(`connected as ${STATION}, idTag ${IDTAG}, scenario ${scenario}`);
  await call('BootNotification', { chargePointVendor: 'Rex96', chargePointModel: 'Rig' });
  await seed();
  await call('StatusNotification', {
    connectorId: 1,
    errorCode: 'NoError',
    status: 'Preparing',
    timestamp: now(),
  });
  const st = await call('StartTransaction', {
    connectorId: 1,
    idTag: IDTAG,
    meterStart: 1000,
    timestamp: now(),
  });
  txId = st[2]?.transactionId;
  log('transactionId', txId);
  await call('StatusNotification', {
    connectorId: 1,
    errorCode: 'NoError',
    status: 'Charging',
    timestamp: now(),
  });
  await sleep(1500);
  remoteStop(1);
  await closed;
}

async function check() {
  const failures = [];
  const expect = (ok, what) => {
    log(ok ? 'PASS' : 'FAIL', what);
    if (!ok) failures.push(what);
  };

  const r = received.stopTransactionReply;
  expect(r && r[0] === 3, `StopTransaction answered with CALLRESULT (got ${JSON.stringify(r)})`);

  // Let CitrineOS finish writing the StopTransaction before reading the DB.
  await sleep(1000);
  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();
  try {
    const { rows } = await db.query(
      `SELECT t.id, t."isActive", count(s.id)::int AS "stopRows"
         FROM "Transactions" t
         LEFT JOIN "StopTransactions" s ON s."transactionDatabaseId" = t.id
        WHERE t."transactionId" = $1 AND t."stationId" = $2 AND t."tenantId" = $3
        GROUP BY t.id, t."isActive"`,
      [String(txId), STATION, TENANT_ID],
    );
    const tx = rows[0];
    log('db transaction', JSON.stringify(tx));
    expect(!!tx, `Transactions row exists for transactionId ${txId}`);
    expect(tx && tx.isActive === false, 'transaction is inactive');
    expect(tx && tx.stopRows === 1, 'exactly one StopTransactions row');
  } finally {
    await db.end();
  }
  return failures;
}

const timer = setTimeout(() => {
  log('timeout');
  process.exit(2);
}, 30000);

session()
  .then(check)
  .then((failures) => {
    clearTimeout(timer);
    log(failures.length ? `scenario ${scenario}: FAILED` : `scenario ${scenario}: PASSED`);
    process.exit(failures.length ? 1 : 0);
  })
  .catch((e) => {
    log('error', e);
    process.exit(2);
  });
