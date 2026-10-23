// Kiosk device tokens, pairing codes and staff PINs. Server-only: uses
// node:crypto, and nothing here should ever reach a browser bundle.
import { createHash, randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

// The long-lived secret a paired kiosk keeps in its cookie.
export function newDeviceToken(): string {
  return randomBytes(32).toString("base64url");
}

// No 0/O/1/I/L so a code read off a laptop screen is typed right first time.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

// One-time code typed into the tablet to pair it, e.g. "K7Q4-M9XP".
export function newPairingCode(): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

// Accepts "k7q4 m9xp", "K7Q4M9XP" or "K7Q4-M9XP".
export function normalisePairingCode(input: string): string | null {
  const s = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (s.length !== 8 || [...s].some((ch) => !CODE_ALPHABET.includes(ch))) return null;
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

// PINs are 4 digits. Reject the ones anyone would guess first.
const WEAK_PINS = new Set(["0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999", "1234", "4321", "1212", "0123", "9876"]);

export function pinProblem(pin: string): string | null {
  if (!/^\d{4}$/.test(pin)) return "The PIN must be exactly 4 digits.";
  if (WEAK_PINS.has(pin)) return "That PIN is too easy to guess. Choose another.";
  return null;
}

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pin, salt, 32);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, keyHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const actual = await scrypt(pin, Buffer.from(saltHex, "hex"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// After this many wrong PINs in a row, the person is locked out for a while.
export const MAX_PIN_ATTEMPTS = 5;
export const PIN_LOCK_MINUTES = 15;
