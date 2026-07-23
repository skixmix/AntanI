import { describe, expect, it } from "vitest";
import { reorderProjectSubset } from "./projectOrder";

describe("reorderProjectSubset", () => {
  it("keeps an active drag position when the project becomes inactive", () => {
    const projectIds = ["A", "B", "C", "D"];
    const activeProjectIds = ["A", "C"];

    const reordered = reorderProjectSubset(projectIds, activeProjectIds, {
      fromId: "C",
      insertBeforeId: "A",
    });
    const inactiveAfterClosingC = reordered.filter((id) => id !== "A");

    expect(inactiveAfterClosingC).toEqual(["C", "B", "D"]);
  });

  it("moves the project to the end when insertBeforeId is null", () => {
    const projectIds = ["A", "B", "C"];

    const reordered = reorderProjectSubset(projectIds, projectIds, {
      fromId: "A",
      insertBeforeId: null,
    });

    expect(reordered).toEqual(["B", "C", "A"]);
  });

  it("appends to the end when insertBeforeId is not found in the subset", () => {
    const projectIds = ["A", "B", "C"];

    const reordered = reorderProjectSubset(projectIds, projectIds, {
      fromId: "A",
      insertBeforeId: "missing",
    });

    expect(reordered).toEqual(["B", "C", "A"]);
  });

  it("is a no-op when fromId is not part of the subset", () => {
    const projectIds = ["A", "B", "C"];
    const subsetIds = ["B", "C"];

    const reordered = reorderProjectSubset(projectIds, subsetIds, {
      fromId: "A",
      insertBeforeId: "C",
    });

    expect(reordered).toEqual(projectIds);
  });
});
