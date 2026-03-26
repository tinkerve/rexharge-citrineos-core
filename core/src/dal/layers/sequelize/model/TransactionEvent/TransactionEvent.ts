// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
import type {
  TenantDto,
  TransactionEventDto,
  TransactionEventEnumType,
  TriggerReasonEnumType,
  TransactionType,
  TransactionDto,
} from '@citrineos/base';
import { DEFAULT_TENANT_ID, OCPP2_0_1, OCPP2_0_1_Namespace } from '@citrineos/base';
import { BeforeCreate, BeforeUpdate, Column, DataType, Model, Table } from 'sequelize-typescript';

import { MeterValue } from './MeterValue.js';

@Table
export class TransactionEvent extends Model implements TransactionEventDto {
  static readonly MODEL_NAME: string = OCPP2_0_1_Namespace.TransactionEventRequest;

  @Column(DataType.STRING)
  declare stationId: string;

  @Column(DataType.STRING)
  declare eventType: TransactionEventEnumType;

  declare meterValue?: [MeterValue, ...MeterValue[]];

  @Column({
    type: DataType.DATE,
    get() {
      return this.getDataValue('timestamp')?.toISOString();
    },
  })
  declare timestamp: string;

  @Column(DataType.STRING)
  declare triggerReason: TriggerReasonEnumType;

  @Column(DataType.INTEGER)
  declare seqNo: number;

  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  declare offline?: boolean | null;

  @Column(DataType.INTEGER)
  declare numberOfPhasesUsed?: number | null;

  @Column(DataType.DECIMAL)
  declare cableMaxCurrent?: number | null;

  @Column(DataType.INTEGER)
  declare reservationId?: number | null;

  declare transactionDatabaseId?: number;

  declare transaction?: TransactionDto;

  @Column(DataType.JSON)
  declare transactionInfo: TransactionType;

  declare evseId?: number | null;

  declare evse?: OCPP2_0_1.EVSEType;

  @Column(DataType.STRING)
  declare idTokenValue?: string | null;

  @Column(DataType.STRING)
  declare idTokenType?: string | null;

  declare customData?: OCPP2_0_1.CustomDataType | null;

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
  static setDefaultTenant(instance: TransactionEvent) {
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
