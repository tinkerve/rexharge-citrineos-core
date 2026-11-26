// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { QueryInterface } from 'sequelize';

// REX-96: indexes for the orphan transaction close, which runs every minute.
// - Transactions: only active rows are ever scanned (production has a handful at any time).
// - StatusNotifications: the close looks up the first Available notification of a connector after
//   a transaction started. The table is large and append-only, so the index is partial.
// CONCURRENTLY keeps the live tables writable while the index builds; it cannot run inside a
// transaction, and sequelize-cli does not wrap migrations in one.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "transactions_is_active_partial"
         ON "Transactions" ("tenantId", "createdAt") WHERE "isActive" = true`,
    );
    await queryInterface.sequelize.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "status_notifications_available_by_connector"
         ON "StatusNotifications" ("stationId", "connectorId", "createdAt")
         WHERE "connectorStatus" = 'Available'`,
    );
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "status_notifications_available_by_connector"`,
    );
    await queryInterface.sequelize.query(
      `DROP INDEX CONCURRENTLY IF EXISTS "transactions_is_active_partial"`,
    );
  },
};
