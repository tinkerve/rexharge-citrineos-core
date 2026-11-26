// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
import { ILogObj, Logger } from 'tslog';
import { Op, WhereOptions } from 'sequelize';
import { OCPPVersion } from '@citrineos/base';
import { ChargingStation, Connector, StatusNotification, Transaction } from '@citrineos/data';
import { Scheduler } from './Scheduler';

/** An active OCPP 1.6 transaction, with the first Available its connector reported after it. */
export interface ActiveTransactionFacts {
  id: number;
  stationId: string;
  transactionId: string;
  /** When CitrineOS created the transaction (server time). */
  createdAt: Date;
  /** The connector's status now (for logs; it does not decide anything). */
  connectorStatus?: string;
  /**
   * The first Available StatusNotification for the connector after the transaction was created:
   * `receivedAt` is server time and decides the timeout, `chargerTime` is the charger's timestamp
   * and is what gets written as end time.
   */
  firstAvailable?: { receivedAt: Date; chargerTime: Date };
}

export interface ActiveTransactionsQuery {
  /** Only transactions CitrineOS created after this (server time); older ones are left alone. */
  createdAfter: Date;
}

export interface ConnectorTransactionsQuery {
  tenantId: number;
  stationId: string;
  /** Connectors.id of the connector */
  connectorId: number;
  /** The new transaction, which must not close itself. */
  excludeId: number;
  createdBefore: Date;
  createdAfter: Date;
}

/** A transaction that just started; it proves older active ones on its connector are over. */
export interface StartedTransaction {
  id: number;
  tenantId: number;
  stationId: string;
  /** Connectors.id of the connector */
  connectorId: number;
  /** Server time */
  createdAt: Date;
}

/** Storage port of the {@link OrphanTransactionCloser}. */
export interface OrphanTransactionStore {
  /** Active transactions of OCPP 1.6 stations created after `createdAfter`, with their facts. */
  findActiveTransactions(query: ActiveTransactionsQuery): Promise<ActiveTransactionFacts[]>;

  /** Active transactions on one connector of an OCPP 1.6 station, created in the given window. */
  findActiveTransactionsOnConnector(
    query: ConnectorTransactionsQuery,
  ): Promise<ActiveTransactionFacts[]>;

  /**
   * Marks the transaction inactive with the given end time and stopped reason, only if it is still
   * active (a StopTransaction may have closed it meanwhile).
   *
   * @return true if the transaction was closed by this call.
   */
  closeIfStillActive(id: number, endTime: Date, stoppedReason: string): Promise<boolean>;
}

export interface OrphanTransactionCloserOptions {
  /** How long after the connector became Available with no StopTransaction to close. */
  timeoutSeconds: number;
  /** Transactions created longer ago than this are never closed automatically. */
  maxAgeHours: number;
}

/**
 * Closes transactions the charger never ended (REX-96).
 *
 * An active OCPP 1.6 transaction is closed with stoppedReason `Other` when either
 * - its connector moved into Available after it started and `timeoutSeconds` have passed since,
 *   whatever the connector does afterwards (the next driver may already have plugged in), or
 * - a newer transaction starts on the same connector (closed at once).
 * The end time is the charger's time of that first Available, or the new start's server time when
 * no Available was seen.
 *
 * - Only server times decide (transaction createdAt, StatusNotification createdAt), so a charger
 *   with a wrong clock can neither block nor trigger the close.
 * - The window starts at the first Available after the transaction; repeats do not restart it.
 * - Transactions older than `maxAgeHours` are left alone, so the first run after a deploy does not
 *   close a historical backlog with made-up end times.
 * - Every run reads the database, so a restart only delays the close until the next run.
 */
export class OrphanTransactionCloser extends Scheduler {
  static readonly STOPPED_REASON = 'Other';
  private static readonly TASK_KEY = 'orphan-transaction-closer';

  constructor(
    private readonly _store: OrphanTransactionStore,
    private readonly _options: OrphanTransactionCloserOptions,
    logger?: Logger<ILogObj>,
    private readonly _now: () => Date = () => new Date(),
  ) {
    super(logger);
  }

  /** How often to check: at most every minute, often enough for a short test timeout. */
  static checkIntervalSeconds(timeoutSeconds: number): number {
    return Math.max(1, Math.min(60, Math.floor(timeoutSeconds / 2)));
  }

  start(): void {
    const interval = OrphanTransactionCloser.checkIntervalSeconds(this._options.timeoutSeconds);
    this._logger.info(
      `Closing OCPP 1.6 transactions left active ${this._options.timeoutSeconds} s after their connector became Available (transactions up to ${this._options.maxAgeHours} h old), checking every ${interval} s`,
    );
    this.schedule(
      OrphanTransactionCloser.TASK_KEY,
      () => {
        this.closeOrphans().catch((error) =>
          this._logger.error('Failed to close orphaned transactions', error),
        );
      },
      interval,
    );
  }

  stop(): void {
    this.unschedule(OrphanTransactionCloser.TASK_KEY);
  }

  /** @return the number of transactions closed. */
  async closeOrphans(): Promise<number> {
    const now = this._now().getTime();
    const availableBefore = new Date(now - this._options.timeoutSeconds * 1000);
    const transactions = await this._store.findActiveTransactions({
      createdAfter: this._createdAfter(),
    });
    let count = 0;
    for (const transaction of transactions) {
      const firstAvailable = transaction.firstAvailable;
      if (!firstAvailable || firstAvailable.receivedAt > availableBefore) {
        continue;
      }
      if (
        await this._close(
          transaction,
          firstAvailable.chargerTime,
          `connector Available since ${firstAvailable.receivedAt.toISOString()} (now ${transaction.connectorStatus ?? 'unknown'}) and no StopTransaction within ${this._options.timeoutSeconds} s`,
        )
      ) {
        count++;
      }
    }
    return count;
  }

  /**
   * Closes the older active transactions on the connector of a transaction that just started.
   *
   * @return the number of transactions closed.
   */
  async closeSupersededBy(started: StartedTransaction): Promise<number> {
    const transactions = await this._store.findActiveTransactionsOnConnector({
      tenantId: started.tenantId,
      stationId: started.stationId,
      connectorId: started.connectorId,
      excludeId: started.id,
      createdBefore: started.createdAt,
      createdAfter: this._createdAfter(),
    });
    let count = 0;
    for (const transaction of transactions) {
      const endTime = transaction.firstAvailable?.chargerTime ?? started.createdAt;
      if (
        await this._close(
          transaction,
          endTime,
          `a new transaction (id ${started.id}) started on the same connector`,
        )
      ) {
        count++;
      }
    }
    return count;
  }

  private _createdAfter(): Date {
    return new Date(this._now().getTime() - this._options.maxAgeHours * 3600 * 1000);
  }

  private async _close(
    transaction: ActiveTransactionFacts,
    endTime: Date,
    why: string,
  ): Promise<boolean> {
    const closed = await this._store.closeIfStillActive(
      transaction.id,
      endTime,
      OrphanTransactionCloser.STOPPED_REASON,
    );
    if (closed) {
      this._logger.warn(
        `Closed transaction ${transaction.transactionId} at station ${transaction.stationId} with end time ${endTime.toISOString()}: ${why}`,
      );
    }
    return closed;
  }
}

/** {@link OrphanTransactionStore} on the Sequelize models. */
export class SequelizeOrphanTransactionStore implements OrphanTransactionStore {
  findActiveTransactions(query: ActiveTransactionsQuery): Promise<ActiveTransactionFacts[]> {
    return this._find({ isActive: true, createdAt: { [Op.gt]: query.createdAfter } });
  }

  findActiveTransactionsOnConnector(
    query: ConnectorTransactionsQuery,
  ): Promise<ActiveTransactionFacts[]> {
    return this._find({
      isActive: true,
      tenantId: query.tenantId,
      stationId: query.stationId,
      connectorId: query.connectorId,
      id: { [Op.ne]: query.excludeId },
      createdAt: { [Op.gt]: query.createdAfter, [Op.lt]: query.createdBefore },
    });
  }

  async closeIfStillActive(id: number, endTime: Date, stoppedReason: string): Promise<boolean> {
    const [affected] = await Transaction.update(
      { isActive: false, stoppedReason, endTime: endTime.toISOString() },
      { where: { id, isActive: true } },
    );
    return affected > 0;
  }

  private async _find(where: WhereOptions): Promise<ActiveTransactionFacts[]> {
    const transactions = await Transaction.findAll({
      where,
      include: [
        { model: Connector, required: true },
        { model: ChargingStation, required: true, where: { protocol: OCPPVersion.OCPP1_6 } },
      ],
    });
    const result: ActiveTransactionFacts[] = [];
    for (const transaction of transactions) {
      const connector = transaction.connector as Connector;
      // The first move into Available after the transaction, by server receive time.
      const firstAvailable = await StatusNotification.findOne({
        where: {
          tenantId: transaction.tenantId,
          stationId: transaction.stationId,
          connectorId: connector.connectorId,
          connectorStatus: 'Available',
          createdAt: { [Op.gt]: transaction.createdAt },
        },
        order: [['createdAt', 'ASC']],
      });
      const receivedAt = firstAvailable ? new Date(firstAvailable.createdAt) : undefined;
      result.push({
        id: transaction.id,
        stationId: transaction.stationId,
        transactionId: transaction.transactionId,
        createdAt: new Date(transaction.createdAt),
        connectorStatus: connector.status,
        firstAvailable:
          firstAvailable && receivedAt
            ? {
                receivedAt,
                chargerTime: firstAvailable.timestamp
                  ? new Date(firstAvailable.timestamp)
                  : receivedAt,
              }
            : undefined,
      });
    }
    return result;
  }
}
