// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
import type { MeterValueDto, TenantDto, SampledValue } from '@citrineos/base';
import { DEFAULT_TENANT_ID, Namespace } from '@citrineos/base';
import { BeforeCreate, BeforeUpdate, Column, DataType, Model, Table } from 'sequelize-typescript';

@Table
export class MeterValue extends Model implements MeterValueDto {
  static readonly MODEL_NAME: string = Namespace.MeterValue;

  @Column(DataType.INTEGER)
  declare transactionEventId?: number | null;

  @Column(DataType.INTEGER)
  declare transactionDatabaseId?: number | null;

  @Column(DataType.INTEGER)
  declare stopTransactionDatabaseId?: number | null;

  @Column(DataType.JSONB)
  declare sampledValue: [SampledValue, ...SampledValue[]];

  @Column({
    type: DataType.DATE,
    get() {
      return this.getDataValue('timestamp').toISOString();
    },
  })
  declare timestamp: string;

  @Column(DataType.INTEGER)
  declare connectorId?: number;

  declare customData?: any | null;

  @Column(DataType.INTEGER)
  declare tariffId?: number | null;

  @Column(DataType.STRING)
  declare transactionId?: string | null;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    onUpdate: 'CASCADE',
    onDelete: 'RESTRICT',
  })
  declare tenantId: number;

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
