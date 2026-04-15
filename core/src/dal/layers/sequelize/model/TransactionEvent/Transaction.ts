// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
import type { TenantDto, TransactionDto } from '@citrineos/base';
import { DEFAULT_TENANT_ID, Namespace } from '@citrineos/base';
import {
  BeforeCreate,
  BeforeUpdate,
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  HasMany,
  HasOne,
  Model,
  Table,
} from 'sequelize-typescript';
import { Authorization } from '../Authorization/Authorization.js';
import type { ChargingStation as ChargingStationType } from '../Location/ChargingStation.js';
import { ChargingStation } from '../Location/ChargingStation.js';
import { Tariff } from '../Tariff/Tariffs.js';
// keep the direct import to avoid circular dependency
import { Connector } from '../Location/Connector.js';
import { Evse } from '../Location/Evse.js';
import type { Location as LocationType } from '../Location/Location.js';
import { Location } from '../Location/Location.js';
import { Tenant } from '../Tenant.js';

import { ChargingNeeds } from '../ChargingProfile/ChargingNeeds.js';
import { MeterValue } from './MeterValue.js';
import { StartTransaction } from './StartTransaction.js';
import { StopTransaction } from './StopTransaction.js';
import { TransactionEvent } from './TransactionEvent.js';

@Table
export class Transaction extends Model implements TransactionDto {
  static readonly MODEL_NAME: string = Namespace.TransactionType;
  static readonly TRANSACTION_EVENTS_ALIAS = 'transactionEvents';
  static readonly TRANSACTION_EVENTS_FILTER_ALIAS = 'transactionEventsFilter';

  @Column(DataType.INTEGER)
  @ForeignKey(() => Location)
  declare locationId?: number;

  @BelongsTo(() => Location, 'locationId')
  location?: LocationType;

  @ForeignKey(() => ChargingStation)
  @Column({
    type: DataType.INTEGER,
    unique: 'stationPkId_transactionId',
    allowNull: true,
  })
  declare stationPkId?: number;

  @Column({
    type: DataType.STRING,
  })
  stationId!: string;

  @BelongsTo(() => ChargingStation, 'stationPkId')
  station!: ChargingStationType;

  @ForeignKey(() => Evse)
  @Column(DataType.INTEGER)
  declare evseId?: number;

  @BelongsTo(() => Evse, 'evseId')
  declare evse?: Evse | null;

  @ForeignKey(() => Connector)
  @Column(DataType.INTEGER)
  declare connectorId?: number;

  @BelongsTo(() => Connector, 'connectorId')
  declare connector?: Connector | null;

  @Column(DataType.INTEGER)
  @ForeignKey(() => Authorization)
  declare authorizationId?: number;

  @BelongsTo(() => Authorization, 'authorizationId')
  authorization?: Authorization;

  @Column(DataType.INTEGER)
  @ForeignKey(() => Tariff)
  declare tariffId?: number;

  @BelongsTo(() => Tariff, 'tariffId')
  tariff?: Tariff;

  @Column({
    type: DataType.STRING,
    unique: 'stationPkId_transactionId',
  })
  declare transactionId: string;

  @Column(DataType.BOOLEAN)
  declare isActive: boolean;

  @HasMany(() => TransactionEvent, 'transactionDatabaseId')
  declare transactionEvents?: TransactionEvent[];

  // required only for filtering, should not be used to pull transaction events
  declare transactionEventsFilter?: TransactionEvent[];

  @HasMany(() => MeterValue, 'transactionDatabaseId')
  declare meterValues?: MeterValue[];

  @HasOne(() => StartTransaction, 'transactionDatabaseId')
  declare startTransaction?: StartTransaction;

  @HasOne(() => StopTransaction, 'transactionDatabaseId')
  declare stopTransaction?: StopTransaction;

  @HasMany(() => ChargingNeeds, 'transactionDatabaseId')
  declare chargingNeeds?: ChargingNeeds[];

  @Column(DataType.STRING)
  declare chargingState?: string | null;

  @Column(DataType.BIGINT)
  declare timeSpentCharging?: number | null;

  @Column(DataType.DECIMAL)
  declare meterStart?: number | null;

  @Column(DataType.DECIMAL)
  declare totalKwh?: number | null;

  @Column(DataType.STRING)
  declare stoppedReason?: string | null;

  @Column(DataType.INTEGER)
  declare remoteStartId?: number | null;

  @Column(DataType.DECIMAL)
  declare totalCost?: number;

  @Column({
    type: DataType.DATE,
    get() {
      return this.getDataValue('startTime')?.toISOString();
    },
  })
  declare startTime?: string;

  @Column({
    type: DataType.DATE,
    get() {
      return this.getDataValue('endTime')?.toISOString();
    },
  })
  declare endTime?: string;

  @Column(DataType.JSONB)
  declare customData?: any | null;

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

  @BeforeCreate
  static async resolveStationPkId(instance: Transaction): Promise<void> {
    if (instance.stationPkId == null && instance.stationId && instance.tenantId != null) {
      const station = await ChargingStation.findOne({
        where: { id: instance.stationId, tenantId: instance.tenantId },
        attributes: ['pkId'],
      });
      if (station) {
        instance.stationPkId = station.pkId;
      }
    }
  }

  @BeforeUpdate
  @BeforeCreate
  static setDefaultTenant(instance: Transaction) {
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
