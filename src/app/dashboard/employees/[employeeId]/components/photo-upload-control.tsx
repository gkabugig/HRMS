"use client";

import { useRef, useState, useTransition } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { EmployeeAvatar } from "./employee-avatar";
import { uploadEmployeePhoto, removeEmployeePhoto } from "../actions";

export function PhotoUploadControl({
  employeeId,
  name,
  photoUrl,
  photoPath,
  size = 72,
}: {
  employeeId: string;
  name: string;
  photoUrl: string | null;
  photoPath: string | null;
  size?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const formData = new FormData();
    formData.set("photo", file);
    startTransition(async () => {
      try {
        await uploadEmployeePhoto(employeeId, formData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't upload photo.");
      } finally {
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  }

  function handleRemove() {
    if (!photoPath) return;
    setError(null);
    startTransition(async () => {
      try {
        await removeEmployeePhoto(employeeId, photoPath);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't remove photo.");
      }
    });
  }

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <EmployeeAvatar name={name} photoUrl={photoUrl} size={size} />

      {isPending && (
        <div className="absolute inset-0 rounded-2xl bg-black/40 flex items-center justify-center">
          <Loader2 size={20} className="text-white animate-spin" />
        </div>
      )}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={isPending}
        aria-label="Change photo"
        className="absolute -bottom-1.5 -right-1.5 bg-[var(--surface)] border border-[var(--border-subtle)] rounded-full p-1.5 shadow-sm hover:bg-neutral-50 transition-colors disabled:opacity-50"
      >
        <Camera size={14} className="text-neutral-600" />
      </button>

      {photoUrl && (
        <button
          type="button"
          onClick={handleRemove}
          disabled={isPending}
          aria-label="Remove photo"
          className="absolute -top-1.5 -right-1.5 bg-[var(--surface)] border border-[var(--border-subtle)] rounded-full p-1 shadow-sm hover:bg-neutral-50 transition-colors disabled:opacity-50"
        >
          <X size={12} className="text-neutral-500" />
        </button>
      )}

      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileChange} />

      {error && (
        <p className="absolute top-full mt-1 left-0 w-max max-w-[12rem] text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
