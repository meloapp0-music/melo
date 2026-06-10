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
// Static import — the plugin's JS shim must be bundled at build time so
// the iOS native runtime can find it. (Earlier dynamic-import attempt
// worked on the web build but failed at runtime on iOS, where the
// webview can't resolve npm package specifiers.) The plugin ships a
// no-op web implementation, so the static import is safe in the web
// build even though we never actually call its methods on web.
import { PushNotifications } from '@capacitor/push-notifications';
import { upsertDeviceToken } from './db/devices';

let wired = false;

// ---- Notification-tap deep linking ----
// iOS fires `pushNotificationActionPerformed` when the user taps a
// notification — including the tap that cold-launches the app. We wire
// this listener at App mount (no permission needed just to listen) and
// buffer the payload if the tap lands before App has attached its
// handler, so cold-start taps are never dropped.
let tapWired = false;
let tapHandler = null;
let pendingTap = null;

export function onPushTap(handler) {
  tapHandler = handler;
  if (pendingTap && handler) {
    const data = pendingTap;
    pendingTap = null;
    handler(data);
  }
  if (!Capacitor.isNativePlatform || !Capacitor.isNativePlatform()) return;
  if (tapWired) return;
  tapWired = true;
  PushNotifications.addListener('pushNotificationActionPerformed', (event) => {
    // Our custom keys (kind, showId, …) ride at the top level of the
    // APNs payload, which Capacitor surfaces as notification.data.
    const data = event?.notification?.data || {};
    if (tapHandler) tapHandler(data);
    else pendingTap = data;
  });
}

export async function registerForPush() {
  if (!Capacitor.isNativePlatform || !Capacitor.isNativePlatform()) {
    // Web build — quietly no-op.
    return { ok: false, reason: 'not-native' };
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
