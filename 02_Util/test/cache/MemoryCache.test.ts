// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
import { jest } from '@jest/globals';
import { MemoryCache } from '../../src/cache/memory';

// REX-96: the router now writes one TTL key per OCPP message. MemoryCache must not keep a timer
// record for a key once that key is gone, or memory grows with every charger call.
describe('MemoryCache expiry timers', () => {
  const N = 1000;
  let cache: MemoryCache;
  const timers = () => (cache as any)._timeoutMap as Map<string, NodeJS.Timeout>;

  beforeEach(() => {
    jest.useFakeTimers();
    cache = new MemoryCache();
  });

  afterEach(() => jest.useRealTimers());

  it('forgets the timer when a key set with a TTL is removed', async () => {
    for (let i = 0; i < N; i++) {
      await cache.set(`k${i}`, 'v', 'ns', 5);
      await cache.remove(`k${i}`, 'ns');
    }

    expect(timers().size).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('forgets the timer when a key set with setIfNotExist and a TTL is removed', async () => {
    for (let i = 0; i < N; i++) {
      await cache.setIfNotExist(`k${i}`, 'v', 'ns', 5);
      await cache.remove(`k${i}`, 'ns');
    }

    expect(timers().size).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('forgets the timer when a key expires', async () => {
    for (let i = 0; i < N; i++) {
      await cache.set(`a${i}`, 'v', 'ns', 5);
      await cache.setIfNotExist(`b${i}`, 'v', 'ns', 5);
    }

    jest.advanceTimersByTime(5000);

    expect(await cache.get('a0', 'ns')).toBeNull();
    expect(await cache.get('b0', 'ns')).toBeNull();
    expect(timers().size).toBe(0);
  });

  it('forgets the old timer when a key is set again without a TTL', async () => {
    await cache.set('k', 'v1', 'ns', 5);
    await cache.set('k', 'v2', 'ns');

    expect(timers().size).toBe(0);
    jest.advanceTimersByTime(5000);
    expect(await cache.get('k', 'ns')).toBe('v2');
  });

  it('still expires a key after its TTL', async () => {
    await cache.setIfNotExist('k', 'v', 'ns', 5);

    jest.advanceTimersByTime(4999);
    expect(await cache.get('k', 'ns')).toBe('v');
    jest.advanceTimersByTime(1);
    expect(await cache.get('k', 'ns')).toBeNull();
  });
});
