"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { identifyAtKiosk, punchAtKiosk } from "@/lib/branch-ops/kiosk-actions";
import { KIOSK_ACTION_LABEL, type KioskAction } from "@/lib/branch-ops/rules";

type Person = { id: string; name: string; hasPin: boolean };
type Step =
  | { kind: "pick" }
  | { kind: "pin"; person: Person }
  | { kind: "choose"; person: Person; pin: string; actions: KioskAction[]; status: string }
  | { kind: "capture"; person: Person; pin: string; action: KioskAction; count: number }
  | { kind: "done"; message: string; ok: boolean };

const IDLE_MS = 30_000;

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);
  return now;
}

export default function KioskApp({ branchName, staff }: { branchName: string; staff: Person[] }) {
  const [step, setStep] = useState<Step>({ kind: "pick" });
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const now = useClock();

  const reset = useCallback(() => {
    setStep({ kind: "pick" });
    setPin("");
    setError(null);
    setFilter("");
  }, []);

  // Anyone who walks away mid-way leaves the kiosk on the name screen.
  useEffect(() => {
    if (step.kind === "pick") return;
    const t = setTimeout(reset, step.kind === "done" ? 5000 : IDLE_MS);
    return () => clearTimeout(t);
  }, [step, reset]);

  // Keep the front camera warm while someone is mid-way through, so the
  // photo is ready the moment they choose an action.
  const needsCamera = step.kind === "choose" || step.kind === "capture";
  useEffect(() => {
    if (!needsCamera) return;
    let cancelled = false;
    (async () => {
      if (streamRef.current) return;
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          await videoRef.current.play().catch(() => {});
        }
      } catch {
        setError("The camera is not available. Allow camera access for this page in the browser settings.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [needsCamera]);

  useEffect(() => {
    if (needsCamera) return;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, [needsCamera]);

  useEffect(() => {
    if (videoRef.current && streamRef.current && videoRef.current.srcObject !== streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  });

  const snap = (): string | null => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return null;
    const w = 480;
    const h = Math.round((v.videoHeight / v.videoWidth) * w);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(v, 0, 0, w, h);
    return c.toDataURL("image/jpeg", 0.7);
  };

  // Countdown, then take the photo and send it.
  useEffect(() => {
    if (step.kind !== "capture") return;
    if (step.count > 0) {
      const t = setTimeout(() => setStep({ ...step, count: step.count - 1 }), 1000);
      return () => clearTimeout(t);
    }
    // Take the photo on the next tick, after the "1" has cleared the screen.
    const t = setTimeout(() => {
      const photo = snap();
      if (!photo) {
        setError("The camera isn't ready. Look at the screen and try again.");
        setStep({ kind: "choose", person: step.person, pin: step.pin, actions: [step.action], status: "" });
        return;
      }
      setBusy(true);
      punchAtKiosk(step.person.id, step.pin, step.action, photo).then((r) => {
        setBusy(false);
        setStep({ kind: "done", message: r.message ?? r.error ?? "Done.", ok: !r.error });
      });
    }, 150);
    return () => clearTimeout(t);
  }, [step]);

  const submitPin = async (person: Person, value: string) => {
    setBusy(true);
    setError(null);
    const r = await identifyAtKiosk(person.id, value);
    setBusy(false);
    setPin("");
    if (r.error) {
      setError(r.error);
      return;
    }
    if (!r.actions?.length) {
      setStep({ kind: "done", message: r.status ?? "Nothing to record.", ok: true });
      return;
    }
    setStep({ kind: "choose", person, pin: value, actions: r.actions, status: r.status ?? "" });
  };

  const press = (d: string) => {
    if (step.kind !== "pin" || busy) return;
    const next = (pin + d).slice(0, 4);
    setPin(next);
    if (next.length === 4) submitPin(step.person, next);
  };

  const shown = staff.filter((s) => s.name.toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 flex flex-col min-h-screen">
      <header className="flex items-baseline justify-between gap-4 mb-6">
        <div>
          <p className="text-xs uppercase tracking-widest text-neutral-500">Clocking kiosk</p>
          <h1 className="text-xl font-semibold">{branchName}</h1>
        </div>
        <p className="text-3xl font-semibold tabular-nums" suppressHydrationWarning>
          {now ? now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" }) : ""}
        </p>
      </header>

      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-red-950 border border-red-800 text-red-200 px-4 py-3 text-sm">
          {error}
        </p>
      )}

      {step.kind === "pick" && (
        <section className="flex-1">
          <h2 className="text-lg mb-3">Tap your name</h2>
          {staff.length > 12 && (
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search"
              className="w-full mb-3 rounded-xl bg-neutral-900 border border-neutral-700 px-4 py-3"
            />
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {shown.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setError(null);
                  if (!p.hasPin) setError(`${p.name} has no PIN yet. Ask your manager to set one.`);
                  else setStep({ kind: "pin", person: p });
                }}
                className="rounded-2xl bg-neutral-900 border border-neutral-800 hover:border-neutral-600 px-4 py-5 text-left text-base font-medium"
              >
                {p.name}
              </button>
            ))}
          </div>
          {staff.length === 0 && <p className="text-neutral-400">No staff are assigned to this branch yet.</p>}
        </section>
      )}

      {step.kind === "pin" && (
        <section className="flex-1 flex flex-col items-center">
          <h2 className="text-lg mb-1">{step.person.name}</h2>
          <p className="text-neutral-400 mb-4">Enter your 4-digit PIN</p>
          <div className="flex gap-3 mb-6" aria-live="polite">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={`h-4 w-4 rounded-full ${i < pin.length ? "bg-white" : "bg-neutral-700"}`} />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <button key={d} onClick={() => press(d)} disabled={busy} className="rounded-2xl bg-neutral-900 border border-neutral-800 py-5 text-2xl font-semibold disabled:opacity-50">
                {d}
              </button>
            ))}
            <button onClick={reset} className="rounded-2xl py-5 text-sm text-neutral-400">
              Cancel
            </button>
            <button onClick={() => press("0")} disabled={busy} className="rounded-2xl bg-neutral-900 border border-neutral-800 py-5 text-2xl font-semibold disabled:opacity-50">
              0
            </button>
            <button onClick={() => setPin((p) => p.slice(0, -1))} className="rounded-2xl py-5 text-sm text-neutral-400">
              Delete
            </button>
          </div>
        </section>
      )}

      {(step.kind === "choose" || step.kind === "capture") && (
        <section className="flex-1 flex flex-col items-center">
          <h2 className="text-lg">{step.person.name}</h2>
          {step.kind === "choose" && step.status && <p className="text-neutral-400 mb-3">{step.status}</p>}
          <div className="relative w-full max-w-sm aspect-[4/3] rounded-2xl overflow-hidden bg-neutral-900 mb-4">
            <video ref={videoRef} playsInline muted className="h-full w-full object-cover -scale-x-100" />
            {step.kind === "capture" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-7xl font-bold">
                {step.count > 0 ? step.count : busy ? "…" : ""}
              </div>
            )}
          </div>
          {step.kind === "choose" && (
            <div className="grid gap-3 w-full max-w-sm">
              {step.actions.map((a) => (
                <button
                  key={a}
                  onClick={() => {
                    setError(null);
                    setStep({ kind: "capture", person: step.person, pin: step.pin, action: a, count: 3 });
                  }}
                  className={`rounded-2xl py-5 text-xl font-semibold ${a === "clock_in" || a === "end_lunch" ? "bg-emerald-500 text-neutral-950" : "bg-white text-neutral-950"}`}
                >
                  {KIOSK_ACTION_LABEL[a]}
                </button>
              ))}
              <button onClick={reset} className="py-3 text-sm text-neutral-400">
                Cancel
              </button>
              <p className="text-xs text-neutral-500 text-center">Your photo is taken after a 3-second countdown. Look at the screen.</p>
            </div>
          )}
        </section>
      )}

      {step.kind === "done" && (
        <section className="flex-1 flex flex-col items-center justify-center text-center gap-6">
          <p className={`text-2xl font-semibold ${step.ok ? "text-emerald-400" : "text-red-400"}`}>{step.message}</p>
          <button onClick={reset} className="rounded-2xl bg-neutral-900 border border-neutral-800 px-8 py-4">
            Done
          </button>
        </section>
      )}
    </div>
  );
}
