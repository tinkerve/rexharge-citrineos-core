// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
import { Logger } from 'tslog';
import {
  ActiveTransactionFacts,
  ActiveTransactionsQuery,
  ConnectorTransactionsQuery,
  OrphanTransactionCloser,
  OrphanTransactionStore,
} from '../../src/module/OrphanTransactionCloser';

// REX-96: a transaction whose connector moved into Available, with no StopTransaction for longer than
// the orphan timeout, is closed with stoppedReason Other, so the driver is not blocked. A newer
// StartTransaction on the same connector closes it at once.
describe('OrphanTransactionCloser', () => {
  const NOW = new Date('2026-11-23T10:00:00.000Z');
  const TIMEOUT_SECONDS = 600;
  const MAX_AGE_HOURS = 24;

  let active: ActiveTransactionFacts[];
  let onConnector: ActiveTransactionFacts[];
  let stillActive: Set<number>;
  let closed: { id: number; endTime: Date; reason: string }[];
  let activeQueries: ActiveTransactionsQuery[];
  let connectorQueries: ConnectorTransactionsQuery[];
  let closer: OrphanTransactionCloser;

  beforeEach(() => {
    active = [];
    onConnector = [];
    stillActive = new Set();
    closed = [];
    activeQueries = [];
    connectorQueries = [];
    const store: OrphanTransactionStore = {
      findActiveTransactions: async (query) => {
        activeQueries.push(query);
        return active;
      },
      findActiveTransactionsOnConnector: async (query) => {
        connectorQueries.push(query);
        return onConnector;
      },
      closeIfStillActive: async (id, endTime, reason) => {
        if (!stillActive.has(id)) return false;
        stillActive.delete(id);
        closed.push({ id, endTime, reason });
        return true;
      },
    };
    closer = new OrphanTransactionCloser(
      store,
      { timeoutSeconds: TIMEOUT_SECONDS, maxAgeHours: MAX_AGE_HOURS },
      new Logger({ minLevel: 6 }),
      () => NOW,
    );
  });

  // firstAvailable.receivedAt is server time; chargerTime is the charger's timestamp of the same
  // StatusNotification. connectorStatus is the connector's status now.
  const facts = (
    id: number,
    firstAvailable?: { receivedAt: string; chargerTime?: string },
    connectorStatus = 'Available',
  ): ActiveTransactionFacts => ({
    id,
    stationId: 'CS1',
    transactionId: String(id),
    createdAt: new Date('2026-11-23T09:00:00.000Z'),
    connectorStatus,
    firstAvailable: firstAvailable && {
      receivedAt: new Date(firstAvailable.receivedAt),
      chargerTime: new Date(firstAvailable.chargerTime ?? firstAvailable.receivedAt),
    },
  });

  describe('closeOrphans', () => {
    it('only looks at transactions created in the last 24 h (server time)', async () => {
      await closer.closeOrphans();

      expect(activeQueries).toEqual([{ createdAfter: new Date('2026-11-22T10:00:00.000Z') }]);
    });

    it("closes a transaction whose connector became Available longer ago than the timeout, ended at the charger's time", async () => {
      active = [
        facts(7, {
          receivedAt: '2026-11-23T09:49:00.000Z',
          chargerTime: '2026-11-23T17:48:58.000Z',
        }),
      ];
      stillActive.add(7);

      expect(await closer.closeOrphans()).toBe(1);
      expect(closed).toEqual([
        { id: 7, endTime: new Date('2026-11-23T17:48:58.000Z'), reason: 'Other' },
      ]);
    });

    it('still closes it when the next driver already plugged in (connector Preparing again)', async () => {
      active = [facts(7, { receivedAt: '2026-11-23T09:49:00.000Z' }, 'Preparing')];
      stillActive.add(7);

      expect(await closer.closeOrphans()).toBe(1);
      expect(closed.map((c) => c.id)).toEqual([7]);
    });

    it('waits while the timeout has not passed since the first Available', async () => {
      active = [facts(7, { receivedAt: '2026-11-23T09:51:00.000Z' })];
      stillActive.add(7);

      expect(await closer.closeOrphans()).toBe(0);
      expect(closed).toEqual([]);
    });

    it('leaves a transaction alone when no Available was seen after it started', async () => {
      active = [facts(7)];
      stillActive.add(7);

      expect(await closer.closeOrphans()).toBe(0);
    });

    it('leaves a transaction alone when its StopTransaction arrived meanwhile', async () => {
      active = [
        facts(7, { receivedAt: '2026-11-23T09:40:00.000Z' }),
        facts(8, { receivedAt: '2026-11-23T09:41:00.000Z' }),
      ];
      stillActive.add(8); // 7 was stopped normally between the query and the close

      expect(await closer.closeOrphans()).toBe(1);
      expect(closed.map((c) => c.id)).toEqual([8]);
    });
  });

  describe('closeSupersededBy', () => {
    const newTransaction = {
      id: 20,
      tenantId: 1,
      stationId: 'CS1',
      connectorId: 5,
      createdAt: new Date('2026-11-23T09:58:00.000Z'),
    };

    it('asks for older active transactions on the same connector, up to 24 h old', async () => {
      await closer.closeSupersededBy(newTransaction);

      expect(connectorQueries).toEqual([
        {
          tenantId: 1,
          stationId: 'CS1',
          connectorId: 5,
          excludeId: 20,
          createdBefore: new Date('2026-11-23T09:58:00.000Z'),
          createdAfter: new Date('2026-11-22T10:00:00.000Z'),
        },
      ]);
    });

    it('closes the older transaction at once, ended at its first Available, even before the timeout', async () => {
      onConnector = [
        facts(7, {
          receivedAt: '2026-11-23T09:57:00.000Z',
          chargerTime: '2026-11-23T09:56:59.000Z',
        }),
      ];
      stillActive.add(7);

      expect(await closer.closeSupersededBy(newTransaction)).toBe(1);
      expect(closed).toEqual([
        { id: 7, endTime: new Date('2026-11-23T09:56:59.000Z'), reason: 'Other' },
      ]);
    });

    it('ends it at the new start (server time) when no Available was seen', async () => {
      onConnector = [facts(7)];
      stillActive.add(7);

      expect(await closer.closeSupersededBy(newTransaction)).toBe(1);
      expect(closed).toEqual([
        { id: 7, endTime: new Date('2026-11-23T09:58:00.000Z'), reason: 'Other' },
      ]);
    });
  });

  it('checks at most every minute, and more often for a short test timeout', () => {
    expect(OrphanTransactionCloser.checkIntervalSeconds(600)).toBe(60);
    expect(OrphanTransactionCloser.checkIntervalSeconds(10)).toBe(5);
    expect(OrphanTransactionCloser.checkIntervalSeconds(1)).toBe(1);
  });
});
