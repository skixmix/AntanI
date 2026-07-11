import { describe, expect, it } from "vitest";
import { hashTabId } from "./notifications.ipc";

describe("hashTabId", () => {
  it("is deterministic for the same input", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    expect(hashTabId(id)).toBe(hashTabId(id));
  });

  it("differs for different tab ids", () => {
    expect(hashTabId("tab-a")).not.toBe(hashTabId("tab-b"));
  });

  it("fits in a 32-bit signed integer", () => {
    const ids = ["", "a", "tab-1", "550e8400-e29b-41d4-a716-446655440000"];
    for (const id of ids) {
      const hash = hashTabId(id);
      expect(Number.isInteger(hash)).toBe(true);
      expect(hash).toBeGreaterThanOrEqual(0);
      expect(hash).toBeLessThanOrEqual(0x7fffffff);
    }
  });
});
