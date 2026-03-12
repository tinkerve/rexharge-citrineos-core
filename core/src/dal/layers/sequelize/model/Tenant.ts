// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
import type { ServerProfile, TenantDto } from '@citrineos/base';
import type { Optional } from 'sequelize';
import { Column, DataType, Model, PrimaryKey, Table } from 'sequelize-typescript';

export enum TenantAttributeProps {
  id = 'id',
  createdAt = 'createdAt',
  updatedAt = 'updatedAt',
}

export interface TenantAttributes {
  [TenantAttributeProps.id]: string;
  [TenantAttributeProps.createdAt]: Date;
  [TenantAttributeProps.updatedAt]: Date;
}

export interface TenantCreationAttributes
  extends Optional<
    TenantAttributes,
    TenantAttributeProps.createdAt | TenantAttributeProps.updatedAt
  > {}

@Table
export class Tenant extends Model<TenantAttributes, TenantCreationAttributes> implements TenantDto {
  static readonly MODEL_NAME: string = 'Tenant';

  @PrimaryKey
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
  })
  declare id: number;

  @Column(DataType.STRING)
  declare name: string;

  @Column(DataType.STRING)
  declare url?: string | null;

  @Column(DataType.STRING)
  declare partyId?: string | null;

  @Column(DataType.STRING)
  declare countryCode?: string | null;

  @Column(DataType.JSONB)
  declare serverProfileOCPI?: ServerProfile | null;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false,
  })
  declare isUserTenant: boolean;

  /**
   * Relationships - moved to associations.ts
   */
}
