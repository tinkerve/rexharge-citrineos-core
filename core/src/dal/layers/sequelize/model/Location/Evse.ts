// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
import type {
  ChargingNeedsDto,
  ChargingStationDto,
  CompositeScheduleDto,
  ConnectorDto,
  EvseDto,
  TenantDto,
  TransactionDto,
} from '@citrineos/base';
import { DEFAULT_TENANT_ID, Namespace } from '@citrineos/base';
import {
  BeforeCreate,
  BeforeUpdate,
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  HasMany,
  Model,
  Table,
} from 'sequelize-typescript';
import { ChargingNeeds } from '../ChargingProfile/ChargingNeeds.js';
import { CompositeSchedule } from '../ChargingProfile/CompositeSchedule.js';
import { Tenant } from '../Tenant.js';
import { Transaction } from '../TransactionEvent/Transaction.js';
import { ChargingStation } from './ChargingStation.js';
import { Connector } from './Connector.js';

@Table
export class Evse extends Model implements EvseDto {
  static readonly MODEL_NAME: string = Namespace.Evse;

  @ForeignKey(() => ChargingStation)
  @Column({
    type: DataType.INTEGER,
    unique: 'stationPkId_evseTypeId',
  })
  declare stationPkId?: number;

  @Column({
    type: DataType.STRING,
  })
  declare stationId: string;

  @Column({
    type: DataType.INTEGER,
    unique: 'stationPkId_evseTypeId',
  })
  declare evseTypeId?: number; // This is the serial int used in OCPP 2.0.1 to refer to the EVSE.

  @Column(DataType.STRING)
  declare evseId: string; // This is the eMI3 compliant EVSE ID

  @Column(DataType.STRING)
  declare physicalReference?: string | null; // Any identifier printed directly on the EVSE

  @Column(DataType.BOOLEAN)
  declare removed?: boolean;

  @BelongsTo(() => ChargingStation, 'stationPkId')
  declare chargingStation?: ChargingStationDto;

  @HasMany(() => Connector, 'evseId')
  declare connectors?: ConnectorDto[] | null;

  @HasMany(() => ChargingNeeds, 'evseId')
  declare chargingNeeds?: ChargingNeedsDto[];

  @HasMany(() => CompositeSchedule, 'evseId')
  declare compositeSchedules?: CompositeScheduleDto[];

  @HasMany(() => Transaction, 'evseId')
  declare transactions?: TransactionDto[];

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
  static async resolveStationPkId(instance: Evse): Promise<void> {
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
  static setDefaultTenant(instance: Evse) {
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
