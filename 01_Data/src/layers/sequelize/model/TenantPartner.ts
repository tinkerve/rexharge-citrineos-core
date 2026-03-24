// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
import { OCPIRegistration } from '@citrineos/base';
import { ITenantPartnerDto } from '@citrineos/base/src/interfaces/dto/tenant.partner.dto';
import { BelongsToMany, Column, DataType, HasMany, Table } from 'sequelize-typescript';
import { Authorization } from './Authorization';
import { BaseModelWithTenant } from './BaseModelWithTenant';
import { Location } from './Location';
import { TenantPartnerLocation } from './Location/TenantPartnerLocation';

@Table
export class TenantPartner extends BaseModelWithTenant implements ITenantPartnerDto {
  static readonly MODEL_NAME: string = 'TenantPartner';

  @Column(DataType.STRING)
  declare partyId: string;

  @Column(DataType.STRING)
  declare countryCode: string;

  @Column(DataType.JSONB)
  declare partnerProfileOCPI: OCPIRegistration.PartnerProfile;

  @HasMany(() => Authorization)
  declare authorizations: Authorization[];

  @BelongsToMany(() => Location, () => TenantPartnerLocation)
  declare locations?: Location[] | null;
}
