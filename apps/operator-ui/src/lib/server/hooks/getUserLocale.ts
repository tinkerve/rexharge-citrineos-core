// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
'use server';

import { DEFAULT_LOCALE, I18N_COOKIE_NAME } from '@lib/utils/consts';
import { cookies } from 'next/headers';

export async function getUserLocale() {
  return (await cookies()).get(I18N_COOKIE_NAME)?.value || DEFAULT_LOCALE;
}

export async function setUserLocale(locale: string) {
  // Explicit options so the locale is applied to every route (path '/') and
  // persists across reloads as a long-lived cookie rather than a session one.
  // This mirrors the next-intl recommended cookie configuration and ensures
  // the subsequent router.refresh() re-renders with the new locale.
  (await cookies()).set(I18N_COOKIE_NAME, locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: 'lax',
  });
}
