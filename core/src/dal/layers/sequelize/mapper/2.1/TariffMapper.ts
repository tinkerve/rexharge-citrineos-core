// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { OCPP2_1 } from '@citrineos/base';
import { Tariff } from '../../model/Tariff/index.js';

export class TariffMapper {
  /**
   * Maps a {@link Tariff} DB model to an OCPP 2.1 {@link OCPP2_1.TariffType}.
   *
   * - `tariffId` falls back to the DB primary key string when not explicitly set.
   * - All complex fields (`energy`, `chargingTime`, etc.) are stored as JSONB and
   *   passed through directly; their structure is validated at the OCPP message boundary.
   *
   * @throws {Error} if `currency` is missing (required by spec).
   */
  static toOcpp21TariffType(tariff: Tariff): OCPP2_1.TariffType {
    if (!tariff.currency) {
      throw new Error(`Tariff id=${tariff.id} is missing required field: currency`);
    }

    return {
      tariffId: tariff.tariffId ?? String(tariff.id),
      currency: tariff.currency,
      validFrom: tariff.validFrom ?? undefined,
      description: (tariff.description as OCPP2_1.TariffType['description']) ?? undefined,
      energy: tariff.energy ?? undefined,
      chargingTime: tariff.chargingTime ?? undefined,
      idleTime: tariff.idleTime ?? undefined,
      fixedFee: tariff.fixedFee ?? undefined,
      reservationTime: tariff.reservationTime ?? undefined,
      reservationFixed: tariff.reservationFixed ?? undefined,
      minCost: tariff.minCost ?? undefined,
      maxCost: tariff.maxCost ?? undefined,
    };
  }
}
