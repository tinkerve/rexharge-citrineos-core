// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { BelongsTo, Column, DataType, ForeignKey, Table } from 'sequelize-typescript';
import { BaseModelWithTenant } from '../BaseModelWithTenant';
import { TenantPartner } from '../TenantPartner';
import { Location } from './Location';

@Table
export class TenantPartnerLocation extends BaseModelWithTenant {
  static readonly MODEL_NAME: string = 'TenantPartnerLocation';

  @ForeignKey(() => TenantPartner)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    unique: 'tenantPartnerId_locationId',
  })
  declare tenantPartnerId: number;

  @ForeignKey(() => Location)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    unique: 'tenantPartnerId_locationId',
  })
  declare locationId: number;

  @BelongsTo(() => TenantPartner)
  declare tenantPartner: TenantPartner;

  @BelongsTo(() => Location)
  declare location: Location;
}
