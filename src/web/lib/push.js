// lib/push.js — Capacitor push-notifications wiring.
//
// `registerForPush()` is the one entry point. It:
//   1. No-ops on web (Capacitor.isNativePlatform() === false), so
//      `npm run dev` keeps working without any native plumbing.
//   2. Requests permission (the OS prompt only appears once; later
//      calls just return the previous decision).
//   3. Calls register(), which asks APNs for a device token. The
//      token comes back asynchronously via the `registration` event.
//   4. Upserts (token, platform) into our `device_tokens` table so
//      the tour-alerts cron can find it.
//
// Listeners are idempotent — we use a module-level `wired` flag so
// hot-reloading the App component doesn't stack handlers.
//
// We deliberately don't surface a "permission denied" UI here.
// Concert tour alerts are nice-to-have; if the user declines we just
// don't send any. If/when we add an in-app "Notifications" toggle in
// Settings, it can re-call registerForPush() to nudge the prompt.

import { Capacitor } from '@capacitor/core';
import { upsertDeviceToken } from './db/devices';

let wired = false;

export async function registerForPush() {
  if (!Capacitor.isNativePlatform || !Capacitor.isNativePlatform()) {
    // Web build — quietly no-op.
    return { ok: false, reason: 'not-native' };
  }

  let PushNotifications;
  try {
    // Dynamic import keeps the web bundle clean — Capacitor's plugin
    // package is iOS/Android-only and would otherwise break the dev
    // server's module resolution.
    ({ PushNotifications } = await import(/* @vite-ignore */ '@capacitor/push-notifications'));
  } catch (err) {
    // Plugin not installed yet (we haven't run `npm i` after pulling).
    // eslint-disable-next-line no-console
    console.warn('[Melo] @capacitor/push-notifications not installed; skipping push registration');
    return { ok: false, reason: 'plugin-missing' };
  }

  try {
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') {
      return { ok: false, reason: 'permission-denied' };
    }

    if (!wired) {
      // The token arrives asynchronously after register(). Subsequent
      // app launches will fire `registration` again — APNs may rotate
      // the token, so we always upsert.
      PushNotifications.addListener('registration', async (t) => {
        const token = t?.value;
        if (!token) return;
        const platform = Capacitor.getPlatform(); // 'ios' | 'android'
        try {
          await upsertDeviceToken(token, platform);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[Melo] device token upsert failed', err);
        }
      });

      PushNotifications.addListener('registrationError', (err) => {
        // eslint-disable-next-line no-console
        console.error('[Melo] push registration error', err);
      });

      wired = true;
    }

    await PushNotifications.register();
    return { ok: true };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[Melo] registerForPush failed', err);
    return { ok: false, reason: String(err) };
  }
}
