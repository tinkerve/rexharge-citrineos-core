// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
import type {
  ChargingStationCapabilityEnumType,
  ChargingStationDto,
  ChargingStationParkingRestrictionEnumType,
  LocationDto,
  Point,
  TenantDto,
  TransactionDto,
} from '@citrineos/base';
import { DEFAULT_TENANT_ID, Namespace, OCPPVersion } from '@citrineos/base';
import {
  AutoIncrement,
  BeforeCreate,
  BeforeUpdate,
  BelongsTo,
  BelongsToMany,
  Column,
  DataType,
  ForeignKey,
  HasMany,
  Index,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';

import { StatusNotification } from './StatusNotification.js';
import { InstalledCertificate } from '../Certificate/InstalledCertificate.js';
import { Location } from './Location.js';
import { Evse } from './Evse.js';
import { Connector } from './Connector.js';
import { ServerNetworkProfile } from './ServerNetworkProfile.js';
import { ChargingStationNetworkProfile } from './ChargingStationNetworkProfile.js';
import { Transaction } from '../TransactionEvent/Transaction.js';
import { VariableAttribute } from '../DeviceModel/VariableAttribute.js';
import { OCPPMessage } from '../OCPPMessage.js';
import { VariableMonitoring } from '../VariableMonitoring/VariableMonitoring.js';
import { EventData } from '../VariableMonitoring/EventData.js';
import { ChargingStationSecurityInfo } from '../ChargingStationSecurityInfo.js';
import { ChargingStationSequence } from '../ChargingStationSequence/ChargingStationSequence.js';
import { DeleteCertificateAttempt } from '../Certificate/DeleteCertificateAttempt.js';
import { Tenant } from '../Tenant.js';

/**
 * Represents a charging station.
 * Currently, this data model is internal to CitrineOS. In the future, it will be analogous to an OCPI ChargingStation.
 */
@Table
export class ChargingStation extends Model implements ChargingStationDto {
  static readonly MODEL_NAME: string = Namespace.ChargingStation;

  @AutoIncrement
  @PrimaryKey
  @Column(DataType.INTEGER)
  declare pkId: number;

  /**
   * The tenant-scoped charging station identifier — used in WebSocket routing
   * (the charger appends this to the end of the WebSocket URL on connect).
   * Unique per tenant, but two different tenants may share the same value.
   */
  @Index
  @Column({
    type: DataType.STRING(36),
    unique: 'ChargingStations_id_tenantId_key',
  })
  declare id: string;

  @Column(DataType.BOOLEAN)
  declare isOnline: boolean;

  @Column(DataType.STRING)
  declare protocol?: OCPPVersion | null;

  @Column(DataType.DATE)
  declare latestOcppMessageTimestamp?: string | null;

  @Column(DataType.STRING(20))
  declare chargePointVendor?: string | null;

  @Column(DataType.STRING(20))
  declare chargePointModel?: string | null;

  @Column(DataType.STRING(25))
  declare chargePointSerialNumber?: string | null;

  @Column(DataType.STRING(25))
  declare chargeBoxSerialNumber?: string | null;

  @Column(DataType.STRING(50))
  declare firmwareVersion?: string | null;

  @Column(DataType.STRING(20))
  declare iccid?: string | null;

  @Column(DataType.STRING(20))
  declare imsi?: string | null;

  @Column(DataType.STRING(25))
  declare meterType?: string | null;

  @Column(DataType.STRING(25))
  declare meterSerialNumber?: string | null;

  /**
   * [longitude, latitude]
   */
  @Column(DataType.GEOMETRY('POINT'))
  declare coordinates?: Point | null;

  @Column(DataType.STRING)
  declare floorLevel?: string | null;

  @Column(DataType.JSONB)
  declare parkingRestrictions?: ChargingStationParkingRestrictionEnumType[] | null;

  @Column(DataType.JSONB)
  declare capabilities?: ChargingStationCapabilityEnumType[] | null;

  /**
   * In OCPP 1.6, StatusNotifications can be sent with a connectorId of 0 to report the status of the whole charging station.
   * Some charging stations instead use it in ways that cannot be applied to all connectors
   * (such as sending Available when at least one connector is available, while others are charging).
   * When true, this flag indicates that StatusNotifications with connectorId 0 should be used to update all connector statuses.
   * When false, StatusNotifications with connectorId 0 should be ignored.
   */
  @Column({
    type: DataType.BOOLEAN,
    defaultValue: true,
  })
  declare use16StatusNotification0: boolean;

  @ForeignKey(() => Location)
  @Column(DataType.INTEGER)
  declare locationId?: number | null;

  @HasMany(() => StatusNotification, 'stationPkId')
  declare statusNotifications?: StatusNotification[] | null;

  @HasMany(() => InstalledCertificate, 'stationPkId')
  declare installedCertificates?: InstalledCertificate[];

  @HasMany(() => Transaction, 'stationPkId')
  declare transactions?: Transaction[] | null;

  /**
   * The business Location of the charging station. Optional in case a charging station is not yet in the field, or retired.
   */
  @BelongsTo(() => Location, 'locationId')
  declare location?: Location;

  @BelongsToMany(() => ServerNetworkProfile, () => ChargingStationNetworkProfile)
  declare networkProfiles?: ServerNetworkProfile[] | null;

  @HasMany(() => Evse, 'stationPkId')
  declare evses?: Evse[] | null;

  @HasMany(() => Connector, 'stationPkId')
  declare connectors?: Connector[] | null;

  @HasMany(() => VariableAttribute, 'stationPkId')
  declare variableAttributes?: VariableAttribute[];

  @HasMany(() => OCPPMessage, 'stationPkId')
  declare ocppMessages?: OCPPMessage[];

  @HasMany(() => VariableMonitoring, 'stationPkId')
  declare variableMonitorings?: VariableMonitoring[];

  @HasMany(() => EventData, 'stationPkId')
  declare stationEventData?: EventData[];

  @HasMany(() => ChargingStationSecurityInfo, 'stationPkId')
  declare securityInfo?: ChargingStationSecurityInfo[];

  @HasMany(() => ChargingStationSequence, 'stationPkId')
  declare sequences?: ChargingStationSequence[];

  @HasMany(() => DeleteCertificateAttempt, 'stationPkId')
  declare deleteCertificateAttempts?: DeleteCertificateAttempt[];

  @ForeignKey(() => Tenant)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    onUpdate: 'CASCADE',
    onDelete: 'RESTRICT',
    unique: 'ChargingStations_id_tenantId_key',
  })
  declare tenantId: number;

  @BelongsTo(() => Tenant, 'tenantId')
  declare tenant?: TenantDto;

  @BeforeCreate
  @BeforeUpdate
  static setDefaultTenant(instance: ChargingStation) {
    if (instance.isNewRecord && instance.tenantId == null) {
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
