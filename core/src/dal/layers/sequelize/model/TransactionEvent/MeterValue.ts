// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
import type { MeterValueDto, TenantDto, SampledValue } from '@citrineos/base';
import { DEFAULT_TENANT_ID, Namespace } from '@citrineos/base';
import {
  BeforeCreate,
  BeforeUpdate,
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript';
import { Transaction } from './Transaction.js';
import { TransactionEvent } from './TransactionEvent.js';
import { StopTransaction } from './StopTransaction.js';
import { Connector } from '../Location/Connector.js';
import { Tariff } from '../Tariff/Tariffs.js';
import { Tenant } from '../Tenant.js';

@Table
export class MeterValue extends Model implements MeterValueDto {
  static readonly MODEL_NAME: string = Namespace.MeterValue;

  @ForeignKey(() => TransactionEvent)
  @Column(DataType.INTEGER)
  declare transactionEventId?: number | null;

  @BelongsTo(() => TransactionEvent, 'transactionEventId')
  declare transactionEvent?: TransactionEvent;

  @ForeignKey(() => Transaction)
  @Column(DataType.INTEGER)
  declare transactionDatabaseId?: number | null;

  @BelongsTo(() => Transaction, 'transactionDatabaseId')
  declare transaction?: Transaction;

  @ForeignKey(() => StopTransaction)
  @Column(DataType.INTEGER)
  declare stopTransactionDatabaseId?: number | null;

  @BelongsTo(() => StopTransaction, 'stopTransactionDatabaseId')
  declare stopTransaction?: StopTransaction;

  @Column(DataType.JSONB)
  declare sampledValue: [SampledValue, ...SampledValue[]];

  @Column({
    type: DataType.DATE,
    get() {
      return this.getDataValue('timestamp').toISOString();
    },
  })
  declare timestamp: string;

  @ForeignKey(() => Connector)
  @Column(DataType.INTEGER)
  declare connectorId?: number;

  @BelongsTo(() => Connector, 'connectorId')
  declare connector?: Connector;

  declare customData?: any | null;

  @ForeignKey(() => Tariff)
  @Column(DataType.INTEGER)
  declare tariffId?: number | null;

  @BelongsTo(() => Tariff, 'tariffId')
  declare tariff?: Tariff;

  @Column(DataType.STRING)
  declare transactionId?: string | null;

  @ForeignKey(() => Tenant)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    onUpdate: 'CASCADE',
    onDelete: 'RESTRICT',
  })
  declare tenantId: number;

  @BelongsTo(() => Tenant, 'tenantId')
  declare tenant?: TenantDto;

  @BeforeUpdate
  @BeforeCreate
  static setDefaultTenant(instance: MeterValue) {
    if (instance.tenantId == null) {
      instance.tenantId = DEFAULT_TENANT_ID;
    }
  }

  constructor(...args: any[]) {
    super(...args);
    if (this.tenantId == null) {
      this.tenantId = DEFAULT_TENANT_ID;
    }
  }
}
