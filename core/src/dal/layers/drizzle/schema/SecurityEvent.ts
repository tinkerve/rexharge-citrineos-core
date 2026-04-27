// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { integer, pgSchema, pgTable, serial, timestamp, varchar } from 'drizzle-orm/pg-core';
import { TableName } from '@dal/layers/sequelize/model/TableName.js';

// Column definitions are a function to ensure fresh objects per table instance,
// which is required when the same schema is used across multiple pgSchema() calls.
function securityEventColumns() {
  return {
    id: serial('id').primaryKey(),
    stationId: varchar('stationId', { length: 255 }),
    type: varchar('type', { length: 255 }),
    // mode: 'date' returns a JS Date — mapped to ISO string in the repository layer
    timestamp: timestamp('timestamp', { withTimezone: true, mode: 'date' }),
    techInfo: varchar('techInfo', { length: 255 }),
    tenantId: integer('tenantId').notNull(),
    createdAt: timestamp('createdAt', { withTimezone: true, mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updatedAt', { withTimezone: true, mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
  };
}

// Row-level tenancy (current approach): single public schema, tenantId column filter on every query
export const securityEventTable = pgTable(TableName.SecurityEvents, securityEventColumns());

// Schema-per-tenant (future approach): one Postgres schema per tenant, no tenantId filter needed
const tenantTableCache = new Map<number, typeof securityEventTable>();

// Returns a schema-qualified table reference for schema-per-tenant queries.
// Cast to typeof securityEventTable so Drizzle's query builder can infer correct
// return types — the column structure is identical, only the schema name differs at runtime.
export function tenantSecurityEventTable(tenantId: number): typeof securityEventTable {
  if (!tenantTableCache.has(tenantId)) {
    const t = pgSchema(`tenant_${tenantId}`).table(
      TableName.SecurityEvents,
      securityEventColumns(),
    ) as unknown as typeof securityEventTable;
    tenantTableCache.set(tenantId, t);
  }
  return tenantTableCache.get(tenantId)!;
}

export type SecurityEventSelect = typeof securityEventTable.$inferSelect;
export type SecurityEventInsert = typeof securityEventTable.$inferInsert;
