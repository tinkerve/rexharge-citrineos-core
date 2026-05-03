// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Interface for the EVDriver module.
 */

export interface IEVDriverModuleApi {}

/**
 * C25: Request body for the POST /evdriver/webpayment/initiate endpoint.
 * Used when a driver scans a QR code and the CSMS web page calls back
 * to initiate the web payment session.
 */
export interface InitiateWebPaymentRequest {
  /** Charging station ID extracted from the QR URL */
  identifier: string;
  /** EVSE ID from the QR URL */
  evseId: number;
  /** TOTP value from the QR URL for validation (C25.FR.07-09) */
  totp: string;
  /** Maximum cost in currency units (C25.FR.56) */
  maxCost?: number;
  /** Maximum duration in seconds (C25.FR.57) */
  maxTime?: number;
  /** Maximum energy in Wh (C25.FR.58) */
  maxEnergy?: number;
  /** EVSE lock timeout in seconds (default: 300) */
  timeout?: number;
  /** Tenant ID (default: DEFAULT_TENANT_ID) */
  tenantId?: number;
}
