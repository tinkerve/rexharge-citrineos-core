// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
import type { EvseTypeDto, TenantDto } from '@citrineos/base';
import { DEFAULT_TENANT_ID, OCPP2_0_1, OCPP2_Namespace } from '@citrineos/base';
import {
  AutoIncrement,
  BeforeCreate,
  BeforeUpdate,
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  HasMany,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';
import { Connector } from '../Location/Connector.js';
import { Component } from './Component.js';
import { VariableAttribute } from './VariableAttribute.js';
import { Reservation } from '../Reservation.js';
import { Tenant } from '../Tenant.js';

@Table({
  indexes: [
    {
      unique: true,
      name: 'evse_types_tenantId_id',
      fields: ['tenantId', 'id'],
      where: {
        connectorId: null,
      },
    },
  ],
})
export class EvseType extends Model implements OCPP2_0_1.EVSEType, EvseTypeDto {
  static readonly MODEL_NAME: string = OCPP2_Namespace.EVSEType;

  /**
   * Fields
   */

  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare databaseId: number;

  @Column({
    type: DataType.INTEGER,
    unique: 'tenantId_id_connectorId',
  })
  declare id: number;

  @ForeignKey(() => Connector)
  @Column({
    type: DataType.INTEGER,
    unique: 'tenantId_id_connectorId',
  })
  declare connectorId?: number | null;

  @BelongsTo(() => Connector, 'connectorId')
  declare connector?: Connector;

  @HasMany(() => Connector, 'evseTypeConnectorId')
  declare connectors?: Connector[];

  @HasMany(() => Component, 'evseDatabaseId')
  declare components?: Component[];

  @HasMany(() => VariableAttribute, 'evseDatabaseId')
  declare variableAttributes?: VariableAttribute[];

  @HasMany(() => Reservation, 'evseId')
  declare reservations?: Reservation[];

  declare customData?: OCPP2_0_1.CustomDataType | null;

  @ForeignKey(() => Tenant)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    unique: 'tenantId_id_connectorId',
    onUpdate: 'CASCADE',
    onDelete: 'RESTRICT',
  })
  declare tenantId: number;

  @BelongsTo(() => Tenant, 'tenantId')
  declare tenant?: TenantDto;

  @BeforeUpdate
  @BeforeCreate
  static setDefaultTenant(instance: EvseType) {
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
