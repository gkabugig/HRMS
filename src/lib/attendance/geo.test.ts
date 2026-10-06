import { describe, expect, it } from "vitest";
import { distanceMeters, evaluateGeofence, isValidPoint } from "./geo";

const NAIROBI = { lat: -1.2921, lng: 36.8219 };

describe("geo", () => {
  it("is zero for the same point", () => {
    expect(distanceMeters(NAIROBI, NAIROBI)).toBe(0);
  });

  it("measures ~111 km per degree of latitude", () => {
    const d = distanceMeters({ lat: 0, lng: 36 }, { lat: 1, lng: 36 });
    expect(d).toBeGreaterThan(110000);
    expect(d).toBeLessThan(112000);
  });

  it("flags a clock-in outside the radius and passes one inside", () => {
    const branch = { latitude: NAIROBI.lat, longitude: NAIROBI.lng, geofence_radius_m: 150 };
    const near = { lat: NAIROBI.lat + 0.0005, lng: NAIROBI.lng }; // ~55 m
    const far = { lat: NAIROBI.lat + 0.01, lng: NAIROBI.lng }; // ~1.1 km
    expect(evaluateGeofence(near, branch)?.inside).toBe(true);
    expect(evaluateGeofence(far, branch)?.inside).toBe(false);
  });

  it("gives no verdict when the branch has no coordinates", () => {
    expect(evaluateGeofence(NAIROBI, { latitude: null, longitude: null, geofence_radius_m: 150 })).toBeNull();
    expect(evaluateGeofence(NAIROBI, null)).toBeNull();
  });

  it("rejects non-numeric or out-of-range coordinates", () => {
    expect(isValidPoint({ lat: "1", lng: 2 })).toBe(false);
    expect(isValidPoint({ lat: 91, lng: 0 })).toBe(false);
    expect(isValidPoint({ lat: NaN, lng: 0 })).toBe(false);
    expect(isValidPoint(NAIROBI)).toBe(true);
  });
});
