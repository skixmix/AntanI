import { describe, expect, it } from "vitest";
import { SPLIT_HEADER_H } from "./constants";
import { paneCellRect, paneIndexAt, paneRect } from "./splitLayout";

describe("paneRect", () => {
  describe("2 members", () => {
    it("splits the full height by colRatio, header offset from the top", () => {
      expect(paneRect(0, 2, 0.5, 0.5)).toEqual({
        top: `${SPLIT_HEADER_H}px`,
        left: "0%",
        width: "50%",
        bottom: "0",
      });
      expect(paneRect(1, 2, 0.5, 0.5)).toEqual({
        top: `${SPLIT_HEADER_H}px`,
        left: "50%",
        width: "50%",
        bottom: "0",
      });
    });

    it("respects an asymmetric colRatio", () => {
      expect(paneRect(0, 2, 0.3, 0.5)).toEqual({
        top: `${SPLIT_HEADER_H}px`,
        left: "0%",
        width: "30%",
        bottom: "0",
      });
      expect(paneRect(1, 2, 0.3, 0.5)).toEqual({
        top: `${SPLIT_HEADER_H}px`,
        left: "30%",
        width: "70%",
        bottom: "0",
      });
    });

    it("ignores rowRatio entirely", () => {
      expect(paneRect(0, 2, 0.5, 0.2)).toEqual(paneRect(0, 2, 0.5, 0.9));
    });
  });

  describe("3 members", () => {
    it("splits the top row by colRatio down to the rowRatio boundary", () => {
      expect(paneRect(0, 3, 0.5, 0.6)).toEqual({
        top: `${SPLIT_HEADER_H}px`,
        left: "0%",
        width: "50%",
        bottom: "calc(40%)",
      });
      expect(paneRect(1, 3, 0.5, 0.6)).toEqual({
        top: `${SPLIT_HEADER_H}px`,
        left: "50%",
        width: "50%",
        bottom: "calc(40%)",
      });
    });

    it("spans the full width for the bottom (3rd) member", () => {
      expect(paneRect(2, 3, 0.5, 0.6)).toEqual({
        top: `calc(60% + ${SPLIT_HEADER_H}px)`,
        left: "0%",
        width: "100%",
        bottom: "0",
      });
    });
  });

  describe("4 members", () => {
    it("splits both rows by the same colRatio", () => {
      expect(paneRect(0, 4, 0.4, 0.6)).toEqual({
        top: `${SPLIT_HEADER_H}px`,
        left: "0%",
        width: "40%",
        bottom: "calc(40%)",
      });
      expect(paneRect(1, 4, 0.4, 0.6)).toEqual({
        top: `${SPLIT_HEADER_H}px`,
        left: "40%",
        width: "60%",
        bottom: "calc(40%)",
      });
      expect(paneRect(2, 4, 0.4, 0.6)).toEqual({
        top: `calc(60% + ${SPLIT_HEADER_H}px)`,
        left: "0%",
        width: "40%",
        bottom: "0",
      });
      expect(paneRect(3, 4, 0.4, 0.6)).toEqual({
        top: `calc(60% + ${SPLIT_HEADER_H}px)`,
        left: "40%",
        width: "60%",
        bottom: "0",
      });
    });
  });

  describe("paneCellRect", () => {
    it("starts at the quadrant's top edge, not offset by the header", () => {
      expect(paneCellRect(0, 2, 0.5, 0.5)).toEqual({
        top: "0%",
        left: "0%",
        width: "50%",
        bottom: "0",
      });
      expect(paneCellRect(2, 4, 0.4, 0.6)).toEqual({
        top: "60%",
        left: "0%",
        width: "40%",
        bottom: "0",
      });
    });

    it("matches paneRect's left/width/bottom, differing only in top", () => {
      const content = paneRect(1, 3, 0.5, 0.6);
      const cell = paneCellRect(1, 3, 0.5, 0.6);
      expect(cell.left).toBe(content.left);
      expect(cell.width).toBe(content.width);
      expect(cell.bottom).toBe(content.bottom);
      expect(cell.top).not.toBe(content.top);
    });
  });

  describe("edge ratios", () => {
    it("handles a colRatio at the minimum bound", () => {
      const rect = paneRect(0, 4, 0.2, 0.5);
      expect(rect.width).toBe("20%");
    });

    it("handles a colRatio at the maximum bound", () => {
      const rect = paneRect(1, 4, 0.8, 0.5);
      expect(Number.parseFloat(rect.width)).toBeCloseTo(20);
    });

    it("handles a rowRatio at the minimum bound", () => {
      const rect = paneRect(2, 4, 0.5, 0.2);
      expect(rect.top).toBe(`calc(20% + ${SPLIT_HEADER_H}px)`);
    });
  });
});

describe("paneIndexAt", () => {
  it("is the inverse of quadrant placement for 2 members", () => {
    expect(paneIndexAt(0.1, 0.1, 2, 0.5, 0.5)).toBe(0);
    expect(paneIndexAt(0.9, 0.1, 2, 0.5, 0.5)).toBe(1);
    // rowRatio is irrelevant with only 2 members — always row 0.
    expect(paneIndexAt(0.1, 0.9, 2, 0.5, 0.5)).toBe(0);
  });

  it("resolves the top row for 3 members like the 4-member grid", () => {
    expect(paneIndexAt(0.1, 0.1, 3, 0.5, 0.6)).toBe(0);
    expect(paneIndexAt(0.9, 0.1, 3, 0.5, 0.6)).toBe(1);
  });

  it("collapses the bottom row to a single index for 3 members regardless of x", () => {
    expect(paneIndexAt(0.1, 0.9, 3, 0.5, 0.6)).toBe(2);
    expect(paneIndexAt(0.9, 0.9, 3, 0.5, 0.6)).toBe(2);
  });

  it("resolves all four quadrants for 4 members", () => {
    expect(paneIndexAt(0.1, 0.1, 4, 0.5, 0.5)).toBe(0);
    expect(paneIndexAt(0.9, 0.1, 4, 0.5, 0.5)).toBe(1);
    expect(paneIndexAt(0.1, 0.9, 4, 0.5, 0.5)).toBe(2);
    expect(paneIndexAt(0.9, 0.9, 4, 0.5, 0.5)).toBe(3);
  });

  it("treats points exactly on the divider as belonging to the far side", () => {
    expect(paneIndexAt(0.5, 0.1, 4, 0.5, 0.5)).toBe(1);
    expect(paneIndexAt(0.1, 0.5, 4, 0.5, 0.5)).toBe(2);
  });
});
