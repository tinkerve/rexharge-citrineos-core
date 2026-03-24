// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
import type {
  ChargingStationDto,
  ConnectorDto,
  ConnectorErrorCodeEnumType,
  ConnectorFormatEnumType,
  ConnectorPowerTypeEnumType,
  ConnectorStatusEnumType,
  ConnectorTypeEnumType,
  TenantDto,
} from '@citrineos/base';
import { DEFAULT_TENANT_ID, OCPP1_6_Namespace } from '@citrineos/base';
import { BeforeCreate, BeforeUpdate, Column, DataType, Model, Table } from 'sequelize-typescript';
import { Evse } from './Evse.js';

@Table
export class Connector extends Model implements ConnectorDto {
  static readonly MODEL_NAME: string = OCPP1_6_Namespace.Connector;

  @Column({
    unique: 'stationId_connectorId',
    allowNull: false,
    type: DataType.STRING,
  })
  declare stationId: string;

  @Column({
    unique: 'evseId_evseTypeConnectorId',
    type: DataType.INTEGER,
  })
  declare evseId: number;

  @Column({
    unique: 'stationId_connectorId',
    type: DataType.INTEGER,
  })
  declare connectorId: number; // This is the serial int starting at 1 used in OCPP 1.6 to refer to the connector, unique per Charging Station.

  @Column({
    unique: 'evseId_evseTypeConnectorId',
    type: DataType.INTEGER,
  })
  declare evseTypeConnectorId?: number; // This is the serial int starting at 1 used in OCPP 2.0.1 to refer to the connector, unique per EVSE.

  @Column({
    type: DataType.STRING,
    defaultValue: 'Unknown',
  })
  declare status: ConnectorStatusEnumType;

  @Column(DataType.STRING)
  declare type?: ConnectorTypeEnumType | null;

  @Column(DataType.STRING)
  declare format?: ConnectorFormatEnumType | null;

  @Column({
    type: DataType.STRING,
    defaultValue: 'NoError',
  })
  declare errorCode: ConnectorErrorCodeEnumType;

  @Column(DataType.STRING)
  declare powerType?: ConnectorPowerTypeEnumType | null;

  @Column(DataType.INTEGER)
  declare maximumAmperage?: number | null;

  @Column(DataType.INTEGER)
  declare maximumVoltage?: number | null;

  @Column(DataType.INTEGER)
  declare maximumPowerWatts?: number | null;

  @Column({
    type: DataType.DATE,
    get() {
      return this.getDataValue('timestamp').toISOString();
    },
  })
  declare timestamp: string;

  @Column(DataType.STRING)
  declare info?: string | null;

  @Column(DataType.STRING)
  declare vendorId?: string | null;

  @Column(DataType.STRING)
  declare vendorErrorCode?: string | null;

  @Column(DataType.STRING)
  declare termsAndConditionsUrl?: string | null;

  declare chargingStation?: ChargingStationDto;

  declare evse?: Evse;

  declare tariffs?: any[];

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
  static setDefaultTenant(instance: Connector) {
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
