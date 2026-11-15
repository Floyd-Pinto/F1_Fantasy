import { useCallback, useEffect, useState } from "react";
import { api } from "../api";

const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

const urlBase64ToUint8Array = (base64: string) => {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

// Brave exposes navigator.brave; it ships with Google's push service (FCM) switched off.
const isBrave = () => typeof (navigator as any).brave?.isBrave === "function";

// The browser's own push errors are cryptic ("Registration failed - push service error"); say what to do.
function explainPushError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  if (/push service|registration failed/i.test(message) || (err instanceof DOMException && err.name === "AbortError")) {
    return isBrave()
      ? 'Brave blocks push notifications by default. Open brave://settings/privacy, turn on "Use Google services for push messaging", restart Brave and try again.'
      : "Your browser's push service is unavailable (it may be disabled or blocked on this network). Try Chrome, Edge or Firefox.";
  }
  return message || "Could not enable reminders";
}

/** Browser lock-time reminders via Web Push. Needs https (or localhost). */
export function usePushReminders() {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.getRegistration("/sw.js").then(async (reg) => {
      setEnabled(Boolean(await reg?.pushManager.getSubscription()));
    });
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      if ((await Notification.requestPermission()) !== "granted") throw new Error("Notifications are blocked in your browser settings.");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const { publicKey } = await api.get<{ publicKey: string }>("/push/public-key");
      const sub =
        (await reg.pushManager.getSubscription()) ||
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
      await api.post("/push/subscribe", { subscription: sub.toJSON() });
      setEnabled(true);
    } catch (err) {
      setError(explainPushError(err));
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await api.post("/push/unsubscribe", { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setEnabled(false);
    } finally {
      setBusy(false);
    }
  }, []);

  const sendTest = useCallback(() => api.post("/push/test"), []);

  return { supported, enabled, busy, error, enable, disable, sendTest };
}
