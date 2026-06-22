// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { test } from '../../fixtures';
import { awaitEverestReboot } from '../../fixtures/everest';
import { ChargingStationDetailPage } from '../../pages/charging-stations/detail.page';
import { ModalHarness } from '../../pages/components/modal.po';

test.use({ storageState: 'playwright/.auth/admin.json' });

// A Reset reboots the EVerest manager container (Immediate always; OnIdle once
// the station settles), dropping cp001's OCPP link for ~1 minute. Previously the
// reboot drained implicitly in the NEXT test's everestStation fixture setup, so
// a slow recovery surfaced as that test failing in its guard ("did not return
// online within 150000ms") — non-determinism attributed to the wrong test. We
// instead drain the reboot in an afterEach, inside the reset test that caused it
// (each reset test has the everest-serial 180s budget and only ~3s of real
// work, so there is ample headroom). The next test's guard then returns
// immediately and the ordering race is gone.
//
// The drain MUST observe the reboot's full offline→online cycle, not merely
// "is the station online now". The Reset acks over OCPP — surfacing the toast
// submitAndWaitForToast awaits — BEFORE the manager severs cp001's link, so at
// afterEach time the station is still flagged online. A bare online check would
// short-circuit on that pre-reboot state and hand the reconnect race straight to
// the next test (the E2E-071 flake: a first attempt that hung ~2.5min, green
// only on retry). awaitEverestReboot waits for the link to actually drop, then
// for it to come back, and is a no-op when no reboot took hold (an OnIdle that
// found the station busy), so a non-rebooting reset pays nothing.
test.describe('charging-stations › Reset command @everest', () => {
  test.describe.configure({ retries: 2 });

  test.afterEach(async () => {
    await awaitEverestReboot();
  });

  test('E2E-070: Reset Hard happy path against EVerest station', async ({
    page,
    everestStation,
  }) => {
    const detail = new ChargingStationDetailPage(page);
    await detail.goto(everestStation.id);

    await detail.commandBar.resetButton.click();
    const modal = new ModalHarness(page, /reset/i);
    await modal.expectOpen();
    await modal.select(/reset type/i, /^immediate$/i);
    await modal.submitAndWaitForToast();
  });

  test('E2E-071: Reset OnIdle variant against EVerest station', async ({
    page,
    everestStation,
  }) => {
    const detail = new ChargingStationDetailPage(page);
    await detail.goto(everestStation.id);

    await detail.commandBar.resetButton.click();
    const modal = new ModalHarness(page, /reset/i);
    await modal.expectOpen();
    await modal.select(/reset type/i, /^onidle$/i);
    await modal.submitAndWaitForToast();
  });
});

test.describe('charging-stations › Reset validation + offline', () => {
  test('E2E-073: Reset against an offline (unseeded-EVerest) station fails gracefully', async ({
    page,
    seededStation,
  }) => {
    const detail = new ChargingStationDetailPage(page);
    await detail.goto(seededStation.id);

    await detail.commandBar.resetButton.click();
    const modal = new ModalHarness(page, /reset/i);
    await modal.expectOpen();
    await modal.select(/reset type/i, /^onidle$/i);

    // Without an active OCPP session, the command pipeline returns a failure.
    // The modal stays open and an error toast appears.
    await modal.submitExpectingError();
  });
});
