"use client";

import { useEffect } from "react";

/** Registers the offline-shell service worker (public/sw.js). Production only: a worker in dev just confuses hot reload. */
export function RegisterSw() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((err) => console.error("service worker registration failed", err));
    }
  }, []);
  return null;
}
