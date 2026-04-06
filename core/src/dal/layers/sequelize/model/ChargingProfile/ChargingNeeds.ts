// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
import type {
  ChargingNeedsDto,
  TransactionDto,
  TenantDto,
  EnergyTransferModeEnumType,
  ACChargingParametersType,
  DCChargingParametersType,
} from '@citrineos/base';
import { DEFAULT_TENANT_ID, OCPP2_0_1, OCPP2_Namespace } from '@citrineos/base';
import { BeforeCreate, BeforeUpdate, Column, DataType, Model, Table } from 'sequelize-typescript';
import { Evse } from '../Location/index.js';

@Table
export class ChargingNeeds extends Model implements ChargingNeedsDto {
  static readonly MODEL_NAME: string = OCPP2_Namespace.ChargingNeeds;

  /**
   * Fields
   */
  @Column(DataType.JSONB)
  declare acChargingParameters?: ACChargingParametersType | null;

  @Column(DataType.JSONB)
  declare dcChargingParameters?: DCChargingParametersType | null;

  @Column({
    type: DataType.DATE,
    get() {
      const departureTime: Date = this.getDataValue('departureTime');
      return departureTime ? departureTime.toISOString() : null;
    },
  })
  declare departureTime?: string | null;

  @Column(DataType.STRING)
  declare requestedEnergyTransfer: EnergyTransferModeEnumType;

  @Column(DataType.INTEGER)
  declare maxScheduleTuples?: number | null;

  /**
   * Relations
   */
  @Column(DataType.INTEGER)
  declare evseId: number;

  declare evse: Evse;

  @Column(DataType.INTEGER)
  declare transactionDatabaseId: number;

  declare transaction: TransactionDto;

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
  static setDefaultTenant(instance: ChargingNeeds) {
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
