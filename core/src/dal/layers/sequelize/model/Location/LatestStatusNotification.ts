// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
import {
  DEFAULT_TENANT_ID,
  type LatestStatusNotificationDto,
  OCPP2_0_1_Namespace,
} from '@citrineos/base';
import type { TenantDto } from '@citrineos/base';
import { BeforeCreate, BeforeUpdate, Column, DataType, Model, Table } from 'sequelize-typescript';

import { ChargingStation } from './ChargingStation.js';
import { StatusNotification } from './StatusNotification.js';

@Table
export class LatestStatusNotification extends Model implements LatestStatusNotificationDto {
  static readonly MODEL_NAME: string = OCPP2_0_1_Namespace.LatestStatusNotification;

  declare stationId: string;

  declare chargingStation: ChargingStation;

  declare statusNotificationId: string;

  declare statusNotification: StatusNotification;

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
  static setDefaultTenant(instance: LatestStatusNotification) {
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
