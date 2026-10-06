"use client";

import { startTransition, useActionState, useState } from "react";
import { selfClockAction, type SelfClockState } from "@/lib/attendance/self-clock-actions";

const initial: SelfClockState = {};

// Asks the browser for the phone's location, then submits the coordinates
// with the clock-in/out choice. The server does all verification.
export function ClockCard({ clockedIn, clockedOut }: { clockedIn: boolean; clockedOut: boolean }) {
  const [state, formAction, pending] = useActionState(selfClockAction, initial);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const direction = !clockedIn ? "in" : !clockedOut ? "out" : null;

  function clock(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError("This device doesn't support location. Ask HR to record your attendance.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const data = new FormData(form);
        data.set("lat", String(pos.coords.latitude));
        data.set("lng", String(pos.coords.longitude));
        setLocating(false);
        // useActionState's dispatcher must run inside a transition.
        startTransition(() => formAction(data));
      },
      (err) => {
        setLocating(false);
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? "Location is blocked. Allow location for this site in your browser settings, then try again."
            : "We couldn't get your location. Move to an open area and try again."
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  if (!direction) {
    return <p className="text-sm text-neutral-500 dark:text-neutral-400">You&apos;ve clocked in and out for today.</p>;
  }

  const busy = locating || pending;
  return (
    <form onSubmit={clock} className="space-y-2">
      <input type="hidden" name="direction" value={direction} />
      <button
        type="submit"
        disabled={busy}
        className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {locating ? "Getting your location…" : pending ? "Recording…" : direction === "in" ? "Clock in" : "Clock out"}
      </button>
      {geoError && <p className="text-xs text-red-600">{geoError}</p>}
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
      {state.success && <p className="text-xs text-green-600">{state.success}</p>}
      {state.warning && <p className="text-xs text-amber-600">{state.warning}</p>}
    </form>
  );
}
