// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import type { BootstrapConfig, SecurityEventDto } from '@citrineos/base';
import { OCPP2_0_1 } from '@citrineos/base';
import { and, between, eq, gte, lte } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { ILogObj } from 'tslog';
import { Logger } from 'tslog';
import {
  type SecurityEventSelect,
  securityEventTable,
  tenantSecurityEventTable,
} from '../schema/SecurityEvent.js';
import { DrizzleRepository } from './Base.js';
import type { ISecurityEventRepository } from '@/dal/index.js';

export class DrizzleSecurityEventRepository
  extends DrizzleRepository<typeof securityEventTable, SecurityEventDto>
  implements ISecurityEventRepository
{
  constructor(
    config: BootstrapConfig,
    logger?: Logger<ILogObj>,
    db?: NodePgDatabase,
    useTenantSchema = false,
  ) {
    super(config, logger, db, useTenantSchema);
  }

  protected getTable(tenantId: number): typeof securityEventTable {
    return this.useTenantSchema ? tenantSecurityEventTable(tenantId) : securityEventTable;
  }

  protected toDto(row: SecurityEventSelect): SecurityEventDto {
    return {
      id: row.id,
      stationId: row.stationId ?? '',
      type: row.type ?? '',
      // timestamp column is a Date in Drizzle (mode: 'date'); DTO expects an ISO string
      timestamp: row.timestamp?.toISOString() ?? new Date().toISOString(),
      techInfo: row.techInfo ?? null,
      tenantId: row.tenantId,
      createdAt: row.createdAt ?? undefined,
      updatedAt: row.updatedAt ?? undefined,
    };
  }

  // ─── ISecurityEventRepository methods ────────────────────────────────────

  async createByStationId(
    tenantId: number,
    value: OCPP2_0_1.SecurityEventNotificationRequest,
    stationId: string,
  ): Promise<SecurityEventDto> {
    // Delegates to base.insert() which handles tenantId injection and event emission.
    // OCPP delivers timestamp as ISO string; Postgres expects a Date for timestamptz.
    return this.insert(tenantId, {
      stationId,
      type: value.type,
      timestamp: new Date(value.timestamp),
      techInfo: value.techInfo ?? null,
    });
  }

  async readByStationIdAndTimestamps(
    tenantId: number,
    stationId: string,
    from?: Date,
    to?: Date,
  ): Promise<SecurityEventDto[]> {
    const table = this.getTable(tenantId);

    const conditions = [eq(table.stationId, stationId)];

    if (!this.useTenantSchema) {
      conditions.push(eq(table.tenantId, tenantId));
    }

    if (from && to) {
      conditions.push(between(table.timestamp!, from, to));
    } else if (from) {
      conditions.push(gte(table.timestamp!, from));
    } else if (to) {
      conditions.push(lte(table.timestamp!, to));
    }

    const rows = await this.db
      .select()
      .from(table)
      .where(and(...conditions));
    return rows.map((row) => this.toDto(row as SecurityEventSelect));
  }

  async deleteByKey(tenantId: number, key: string): Promise<SecurityEventDto | undefined> {
    // Delegates to base.deleteById() which handles the transaction and event emission
    return this.deleteById(tenantId, Number(key));
  }
}
