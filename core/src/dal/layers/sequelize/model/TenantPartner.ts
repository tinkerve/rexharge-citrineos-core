// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
import type {
  PartnerProfile,
  TenantDto,
  TenantPartnerDto,
  AuthorizationDto,
} from '@citrineos/base';
import { DEFAULT_TENANT_ID } from '@citrineos/base';
import { BeforeCreate, BeforeUpdate, Column, DataType, Model, Table } from 'sequelize-typescript';

@Table
export class TenantPartner extends Model implements TenantPartnerDto {
  static readonly MODEL_NAME: string = 'TenantPartner';

  @Column(DataType.STRING)
  declare partyId: string;

  @Column(DataType.STRING)
  declare countryCode: string;

  @Column(DataType.JSONB)
  declare partnerProfileOCPI: PartnerProfile;

  declare authorizations: AuthorizationDto[];

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
  static setDefaultTenant(instance: TenantPartner) {
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
