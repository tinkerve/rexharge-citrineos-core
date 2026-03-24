// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

// Sequelize Persistence Models
export {
  AsyncJobAction,
  AsyncJobName,
  AsyncJobRequest,
  AsyncJobStatus,
  AsyncJobStatusDTO,
  PaginatedParams,
} from './model/AsyncJob';
export {
  Authorization,
  LocalListAuthorization,
  LocalListVersion,
  LocalListVersionAuthorization,
  SendLocalList,
  SendLocalListAuthorization,
} from './model/Authorization';
export { Boot } from './model/Boot';
export {
  Certificate,
  CountryNameEnumType,
  InstalledCertificate,
  SignatureAlgorithmEnumType,
} from './model/Certificate';
export { ChangeConfiguration } from './model/ChangeConfiguration';
export {
  ChargingNeeds,
  ChargingProfile,
  ChargingSchedule,
  CompositeSchedule,
  SalesTariff,
} from './model/ChargingProfile';
export { ChargingStationSecurityInfo } from './model/ChargingStationSecurityInfo';
export { ChargingStationSequence } from './model/ChargingStationSequence';
export {
  Component,
  EvseType,
  Variable,
  VariableAttribute,
  VariableCharacteristics,
  VariableStatus,
} from './model/DeviceModel';
export {
  ChargingStation,
  ChargingStationNetworkProfile,
  Connector,
  Evse,
  LatestStatusNotification,
  Location,
  ServerNetworkProfile,
  SetNetworkProfile,
  StatusNotification,
  TenantPartnerLocation,
} from './model/Location';
export { MessageInfo } from './model/MessageInfo';
export { OCPPMessage } from './model/OCPPMessage';
export { Reservation } from './model/Reservation';
export { SecurityEvent } from './model/SecurityEvent';
export { Subscription } from './model/Subscription';
export { Tariff } from './model/Tariff';
export { Tenant } from './model/Tenant';
export { TenantPartner } from './model/TenantPartner';
export {
  MeterValue,
  StartTransaction,
  StopTransaction,
  Transaction,
  TransactionEvent,
} from './model/TransactionEvent';
export {
  EventData,
  VariableMonitoring,
  VariableMonitoringStatus,
} from './model/VariableMonitoring';

// Sequelize Repositories
export { SequelizeAsyncJobStatusRepository } from './repository/AsyncJobStatus';
export { SequelizeAuthorizationRepository } from './repository/Authorization';
export { SequelizeRepository } from './repository/Base';
export { SequelizeBootRepository } from './repository/Boot';
export { SequelizeCertificateRepository } from './repository/Certificate';
export { SequelizeChangeConfigurationRepository } from './repository/ChangeConfiguration';
export { SequelizeChargingProfileRepository } from './repository/ChargingProfile';
export { SequelizeChargingStationSecurityInfoRepository } from './repository/ChargingStationSecurityInfo';
export { SequelizeChargingStationSequenceRepository } from './repository/ChargingStationSequence';
export { SequelizeDeviceModelRepository } from './repository/DeviceModel';
export { SequelizeInstalledCertificateRepository } from './repository/InstalledCertificate';
export { SequelizeLocalAuthListRepository } from './repository/LocalAuthList';
export { SequelizeLocationRepository } from './repository/Location';
export { SequelizeMessageInfoRepository } from './repository/MessageInfo';
export { SequelizeOCPPMessageRepository } from './repository/OCPPMessage';
export { SequelizeReservationRepository } from './repository/Reservation';
export { SequelizeSecurityEventRepository } from './repository/SecurityEvent';
export { SequelizeSubscriptionRepository } from './repository/Subscription';
export { SequelizeTariffRepository } from './repository/Tariff';
export { SequelizeTenantRepository } from './repository/Tenant';
export { SequelizeTenantPartnerRepository } from './repository/TenantPartner';
export { SequelizeTransactionEventRepository } from './repository/TransactionEvent';
export { SequelizeVariableMonitoringRepository } from './repository/VariableMonitoring';

// Sequelize Utilities
export { DefaultSequelizeInstance } from './util';

// Sequelize Mappers
export * as OCPP1_6_Mapper from './mapper/1.6';
export * as OCPP2_0_1_Mapper from './mapper/2.0.1';
