// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: [], // optional, see below
    include: ['**/*.(test|spec).{ts,tsx}'],
    coverage: {
      reporter: ['text', 'json', 'html'],
    },
  },
  resolve: {
    // Mirror TypeScript path aliases for testing (point to source files, not built files)
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@dal': fileURLToPath(new URL('./core/src/dal', import.meta.url)),
      '@modules': fileURLToPath(new URL('./core/src/modules', import.meta.url)),
      '@util': fileURLToPath(new URL('./core/src/util', import.meta.url)),
      '@ocpp': fileURLToPath(new URL('./base/src/ocpp', import.meta.url)),
      '@config': fileURLToPath(new URL('./base/src/config', import.meta.url)),
      '@interfaces': fileURLToPath(new URL('./base/src/interfaces', import.meta.url)),
      '@base-util': fileURLToPath(new URL('./base/src/util', import.meta.url)),
    },
  },
});
