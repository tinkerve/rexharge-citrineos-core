// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
import type {
  ComponentDto,
  VariableDto,
  VariableMonitoringDto,
  TenantDto,
  MonitorEnumType,
} from '@citrineos/base';
import { DEFAULT_TENANT_ID, OCPP2_0_1, OCPP2_Namespace } from '@citrineos/base';
import {
  AutoIncrement,
  BeforeCreate,
  BeforeUpdate,
  Column,
  DataType,
  Index,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';

@Table
export class VariableMonitoring extends Model implements VariableMonitoringDto {
  static readonly MODEL_NAME: string = OCPP2_Namespace.VariableMonitoringType;

  /**
   * Fields
   */

  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare databaseId: number;

  @Index
  @Column({
    type: DataType.STRING,
    unique: 'stationId_Id',
  })
  declare stationId: string;

  @Column({
    type: DataType.INTEGER,
    unique: 'stationId_Id',
  })
  declare id: number;

  @Column(DataType.BOOLEAN)
  declare transaction: boolean;

  @Column(DataType.INTEGER)
  declare value: number;

  @Column(DataType.STRING)
  declare type: MonitorEnumType;

  @Column(DataType.INTEGER)
  declare severity: number;

  /**
   * Relations
   */

  declare variable: VariableDto;

  @Column({
    type: DataType.INTEGER,
  })
  declare variableId?: number | null;

  declare component: ComponentDto;

  @Column({
    type: DataType.INTEGER,
  })
  declare componentId?: number | null;

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
  static setDefaultTenant(instance: VariableMonitoring) {
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
