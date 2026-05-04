// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import type { Config } from 'drizzle-kit';

// Used for drizzle-kit tooling only (introspect, studio) — not at runtime.
// Run `npm run drizzle:introspect` to validate Drizzle schema definitions
// against the real database schema managed by Sequelize migrations.
export default {
  dialect: 'postgresql',
  schema: './core/src/dal/layers/drizzle/schema/*.ts',
  out: './drizzle-migrations',
  dbCredentials: {
    host: process.env.CITRINEOS_DATABASE_HOST ?? 'localhost',
    port: Number(process.env.CITRINEOS_DATABASE_PORT ?? 5432),
    database: process.env.CITRINEOS_DATABASE_NAME ?? 'citrine',
    user: process.env.CITRINEOS_DATABASE_USERNAME ?? 'citrine',
    password: process.env.CITRINEOS_DATABASE_PASSWORD ?? 'citrine',
  },
} satisfies Config;
