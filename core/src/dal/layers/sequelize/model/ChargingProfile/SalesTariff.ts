// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
import type {
  ChargingScheduleDto,
  SalesTariffDto,
  SalesTariffEntry,
  TenantDto,
} from '@citrineos/base';
import { DEFAULT_TENANT_ID, OCPP2_0_1, OCPP2_Namespace } from '@citrineos/base';
import {
  AutoIncrement,
  BeforeCreate,
  BeforeUpdate,
  Column,
  DataType,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';

import { ChargingSchedule } from './ChargingSchedule.js';

@Table
export class SalesTariff extends Model implements SalesTariffDto {
  static readonly MODEL_NAME: string = OCPP2_Namespace.SalesTariff;

  /**
   * Fields
   */
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare databaseId: number;

  @Column({
    type: DataType.INTEGER,
    unique: 'id_chargingScheduleDatabaseId',
  })
  declare id: number;

  @Column(DataType.INTEGER)
  declare numEPriceLevels?: number | null;

  @Column(DataType.STRING)
  declare salesTariffDescription?: string | null;

  @Column(DataType.JSONB)
  declare salesTariffEntry: [SalesTariffEntry, ...SalesTariffEntry[]];

  /**
   * Relations
   */
  @Column({
    type: DataType.INTEGER,
    unique: 'id_chargingScheduleDatabaseId',
  })
  declare chargingScheduleDatabaseId: number;

  declare chargingSchedule?: ChargingSchedule & ChargingScheduleDto;

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
  static setDefaultTenant(instance: SalesTariff) {
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
