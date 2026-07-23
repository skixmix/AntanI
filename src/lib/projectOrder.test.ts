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
});
