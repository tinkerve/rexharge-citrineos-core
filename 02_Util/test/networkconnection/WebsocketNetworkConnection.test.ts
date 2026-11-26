// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
import { jest } from '@jest/globals';
import { AddressInfo } from 'net';
import { WebSocket } from 'ws';
import { Logger } from 'tslog';
import { CacheNamespace, createIdentifier } from '@citrineos/base';
import { MemoryCache } from '../../src/cache/memory';
import { WebsocketNetworkConnection } from '../../src/networkconnection/WebsocketNetworkConnection';

// REX-96: a charger that reconnects before the server saw its old socket close must end up with
// exactly one live connection. These tests run the real websocket server on a random port with a
// recording router.
describe('WebsocketNetworkConnection reconnect handling (REX-96)', () => {
  const TENANT_ID = 1;
  const STATION_ID = 'CS1';
  const IDENTIFIER = createIdentifier(TENANT_ID, STATION_ID);

  let events: string[];
  let timing: { register: number; deregister: number; registerResult: boolean };
  let stats: { busy: number; max: number };
  let cache: MemoryCache;
  let connection: WebsocketNetworkConnection;
  let port: number;
  let clients: WebSocket[];

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  beforeEach(async () => {
    clients = [];
    cache = new MemoryCache();
    // Per-test state: sockets of an earlier test may still close and call this router late.
    const log: string[] = (events = []);
    const counters = { busy: 0, max: 0 };
    stats = counters;
    const delays = { register: 0, deregister: 0, registerResult: true };
    timing = delays;
    const router: any = {
      registerConnection: jest.fn(async () => {
        counters.max = Math.max(counters.max, ++counters.busy);
        await sleep(delays.register);
        log.push('register');
        counters.busy--;
        return delays.registerResult;
      }),
      deregisterConnection: jest.fn(async () => {
        counters.max = Math.max(counters.max, ++counters.busy);
        log.push('deregister:start');
        await sleep(delays.deregister);
        log.push('deregister:end');
        counters.busy--;
        return true;
      }),
      onMessage: jest.fn(async () => true),
      shutdown: jest.fn(async () => {}),
    };
    const authenticator: any = {
      authenticate: async () => ({ identifier: IDENTIFIER }),
    };
    const config: any = {
      util: {
        networkConnection: {
          websocketServers: [
            {
              id: '0',
              securityProfile: 0,
              allowUnknownChargingStations: true,
              pingInterval: 60,
              host: '127.0.0.1',
              port: 0,
              protocol: 'ocpp1.6',
              tenantId: TENANT_ID,
            },
          ],
        },
      },
    };
    connection = new WebsocketNetworkConnection(
      config,
      cache,
      authenticator,
      router,
      new Logger({ minLevel: 6 }),
    );
    const server = (connection as any)._httpServersMap.get('0');
    if (!server.listening) await new Promise((r) => server.once('listening', r));
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    clients.forEach((c) => c.terminate());
    (connection as any)._pingTimeouts.forEach((t: NodeJS.Timeout) => clearTimeout(t));
    (connection as any)._httpServersMap.forEach((s: any) => s.close());
    await sleep(50);
  });

  const connect = async (settleMs = 50) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/${STATION_ID}`, ['ocpp1.6']);
    clients.push(ws);
    const received: string[] = [];
    ws.on('message', (m) => received.push(m.toString()));
    const closed = new Promise<void>((r) => ws.on('close', () => r()));
    await new Promise((r, j) => {
      ws.once('open', r);
      ws.once('error', j);
    });
    await sleep(settleMs); // let the server finish registering the connection
    return { ws, received, closed };
  };

  it('replaces a still-open socket: cleans up the old one before the new one registers', async () => {
    const first = await connect();
    const second = await connect();

    expect(events).toEqual(['register', 'deregister:start', 'deregister:end', 'register']);
    await first.closed; // the server closed the old socket itself

    await connection.sendMessage(IDENTIFIER, 'hello');
    await sleep(50);
    expect(second.received).toEqual(['hello']);
    expect(first.received).toEqual([]);
  });

  it("does not let the old socket's close tear down the new connection", async () => {
    await connect();
    await connect();
    await sleep(100);

    expect(events.filter((e) => e === 'deregister:start')).toHaveLength(1);
    expect(await cache.get(IDENTIFIER, CacheNamespace.Connections)).not.toBeNull();
    await expect(connection.sendMessage(IDENTIFIER, 'still here')).resolves.toBeUndefined();
  });

  it('waits for an in-flight cleanup before registering a new connection', async () => {
    timing.deregister = 300;
    const first = await connect();
    first.ws.close();
    await first.closed;
    await sleep(20); // the old socket's cleanup is now running
    await connect();
    await sleep(400);

    expect(events).toEqual(['register', 'deregister:start', 'deregister:end', 'register']);
    expect(await cache.get(IDENTIFIER, CacheNamespace.Connections)).not.toBeNull();
  });

  it('a normal disconnect deregisters once and forgets the connection', async () => {
    const only = await connect();
    only.ws.close();
    await only.closed;
    await sleep(100);

    expect(events).toEqual(['register', 'deregister:start', 'deregister:end']);
    expect(await cache.get(IDENTIFIER, CacheNamespace.Connections)).toBeNull();
    await expect(connection.sendMessage(IDENTIFIER, 'gone')).rejects.toThrow();
  });

  it('handles three connections in quick succession one at a time, leaving the last one', async () => {
    timing.register = 150;
    timing.deregister = 50;
    const [a, b, c] = await Promise.all([connect(0), connect(0), connect(0)]);
    await sleep(1000);

    expect(stats.max).toBe(1); // no registration or cleanup ever overlapped another
    expect(events).toEqual([
      'register',
      'deregister:start',
      'deregister:end',
      'register',
      'deregister:start',
      'deregister:end',
      'register',
    ]);
    const open = [a, b, c].filter((x) => x.ws.readyState === WebSocket.OPEN);
    expect(open).toHaveLength(1);
    await connection.sendMessage(IDENTIFIER, 'last');
    await sleep(50);
    expect(open[0].received).toEqual(['last']);
  });

  it('cleans up a socket that closes while it is still registering', async () => {
    timing.register = 300;
    const early = await connect(0);
    early.ws.close();
    await early.closed;
    await sleep(600);

    expect(events).toEqual(['register', 'deregister:start', 'deregister:end']);
    expect(await cache.get(IDENTIFIER, CacheNamespace.Connections)).toBeNull();
  });

  it('cleans up a connection whose registration failed', async () => {
    timing.registerResult = false;
    const failed = await connect(0);
    await failed.closed; // the server closes it with 1011
    await sleep(200);

    expect(events).toEqual(['register', 'deregister:start', 'deregister:end']);
    expect(await cache.get(IDENTIFIER, CacheNamespace.Connections)).toBeNull();
  });
});
