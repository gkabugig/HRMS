import { describe, expect, it } from "vitest";
import { isInternalUsernameEmail, resolveLoginIdentifier, usernameToEmail, validateUsername } from "./username";

describe("username helpers", () => {
  it("maps a username to its internal email, case-insensitively", () => {
    expect(usernameToEmail("  Jane.Doe ")).toBe("jane.doe@hrms.local");
  });

  it("treats input containing @ as a real email", () => {
    expect(resolveLoginIdentifier("Jane@Example.com")).toEqual({ email: "jane@example.com", username: null });
  });

  it("treats input without @ as a username", () => {
    expect(resolveLoginIdentifier("JDoe")).toEqual({ email: "jdoe@hrms.local", username: "jdoe" });
  });

  it("accepts good usernames and rejects bad ones", () => {
    expect(validateUsername("jane.doe-1")).toBeNull();
    expect(validateUsername("ab")).not.toBeNull();
    expect(validateUsername("has space")).not.toBeNull();
    expect(validateUsername("-leading")).not.toBeNull();
    expect(validateUsername("a".repeat(31))).not.toBeNull();
  });

  it("recognises internal addresses so notifications can skip email", () => {
    expect(isInternalUsernameEmail("jane@hrms.local")).toBe(true);
    expect(isInternalUsernameEmail("jane@gmail.com")).toBe(false);
    expect(isInternalUsernameEmail(null)).toBe(false);
  });
});
