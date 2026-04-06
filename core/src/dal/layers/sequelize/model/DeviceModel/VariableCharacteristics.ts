// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
import type { VariableCharacteristicsDto, VariableDto, TenantDto } from '@citrineos/base';
import { DEFAULT_TENANT_ID, OCPP2_0_1, OCPP2_Namespace } from '@citrineos/base';
import { BeforeCreate, BeforeUpdate, Column, DataType, Model, Table } from 'sequelize-typescript';

@Table
export class VariableCharacteristics
  extends Model
  implements OCPP2_0_1.VariableCharacteristicsType, VariableCharacteristicsDto
{
  static readonly MODEL_NAME: string = OCPP2_Namespace.VariableCharacteristicsType;

  /**
   * Fields
   */

  @Column(DataType.STRING)
  declare unit?: string | null;

  @Column(DataType.STRING)
  declare dataType: OCPP2_0_1.DataEnumType;

  @Column(DataType.DECIMAL)
  declare minLimit?: number | null;

  @Column(DataType.DECIMAL)
  declare maxLimit?: number | null;

  @Column(DataType.STRING(4000))
  declare valuesList?: string | null;

  @Column(DataType.BOOLEAN)
  declare supportsMonitoring: boolean;

  /**
   * Relations
   */

  declare variable: VariableDto;

  @Column({
    type: DataType.INTEGER,
    unique: true,
  })
  declare variableId?: number | null;

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
  static setDefaultTenant(instance: VariableCharacteristics) {
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
