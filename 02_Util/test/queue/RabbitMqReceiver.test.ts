// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
import { jest } from '@jest/globals';
import { Logger } from 'tslog';
import { CacheNamespace } from '@citrineos/base';
import { MemoryCache } from '../../src/cache/memory';
import { RabbitMqReceiver } from '../../src/queue/rabbit-mq/receiver';

// REX-96: a station's queues must all be deleted when it disconnects or reconnects, even when the
// shared queue list in the cache lost track of some of them (the leak behind duplicated commands).
describe('RabbitMqReceiver station queues (REX-96)', () => {
  const IDENTIFIER = '1:CS1';
  const LIST_KEY = `rabbit_subscription_${IDENTIFIER}`;

  let live: Set<string>;
  let cache: MemoryCache;
  let receiver: RabbitMqReceiver;

  beforeEach(() => {
    live = new Set();
    let tick = 0;
    jest.spyOn(Date, 'now').mockImplementation(() => 1_000 + tick++);
    const channel: any = {
      assertExchange: jest.fn(async () => ({})),
      assertQueue: jest.fn(async (name: string) => {
        live.add(name);
        return { queue: name };
      }),
      bindQueue: jest.fn(async () => ({})),
      unbindQueue: jest.fn(async () => ({})),
      consume: jest.fn(async () => ({ consumerTag: 'tag' })),
      deleteQueue: jest.fn(async (name: string) => {
        live.delete(name);
        return { messageCount: 0 };
      }),
    };
    cache = new MemoryCache();
    const config: any = { util: { messageBroker: { amqp: { exchange: 'citrineos' } } } };
    receiver = new RabbitMqReceiver(config, new Logger({ minLevel: 6 }), undefined, cache);
    (receiver as any)._channel = channel;
  });

  afterEach(() => jest.restoreAllMocks());

  const subscribeStation = () =>
    receiver.subscribe(IDENTIFIER, undefined, { stationId: 'CS1', state: '1' });

  it('deletes every queue of the station on unsubscribe', async () => {
    await subscribeStation();
    await subscribeStation();

    await receiver.unsubscribe(IDENTIFIER);

    expect([...live]).toEqual([]);
  });

  it('also deletes queues the cached queue list lost track of', async () => {
    await subscribeStation(); // the old connection's queue
    await cache.remove(LIST_KEY, CacheNamespace.Other); // a racing cleanup wiped the list
    await subscribeStation(); // the new connection's queue

    await receiver.unsubscribe(IDENTIFIER);

    expect([...live]).toEqual([]);
  });

  it("leaves other stations' queues alone", async () => {
    await receiver.subscribe('1:CS2', undefined, { stationId: 'CS2' });
    await subscribeStation();

    await receiver.unsubscribe(IDENTIFIER);

    expect([...live]).toEqual(['rabbit_queue_1:CS2_1000']);
  });

  it('keeps deleting the other queues when one delete fails', async () => {
    await subscribeStation();
    await subscribeStation();
    const channel = (receiver as any)._channel;
    const realDelete = channel.deleteQueue;
    channel.deleteQueue = jest.fn(async (name: string) => {
      if (name === 'rabbit_queue_1:CS1_1000') throw new Error('NOT_FOUND - no queue');
      return realDelete(name);
    });

    await expect(receiver.unsubscribe(IDENTIFIER)).resolves.toBe(true);

    expect([...live]).toEqual(['rabbit_queue_1:CS1_1000']); // only the failed one is left
    expect((receiver as any)._queuesByIdentifier.has(IDENTIFIER)).toBe(false);
    expect(await cache.get(LIST_KEY, CacheNamespace.Other)).toBeNull();
  });
});
