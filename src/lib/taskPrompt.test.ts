import { describe, expect, it } from "vitest";
import { buildTaskBrief, buildTaskInstruction } from "./taskPrompt";
import type { Task } from "./types";

const task: Task = {
  id: "u1",
  taskId: "OE-3",
  title: "Add login",
  description: "Full brief body.",
  status: "todo",
  createdAt: 0,
  updatedAt: 0,
  startedAt: null,
  doneAt: null,
  enteredColumnAt: null,
};

describe("buildTaskBrief", () => {
  it("includes the task id, title, project name and description", () => {
    const brief = buildTaskBrief("My App", task);
    expect(brief).toContain("OE-3");
    expect(brief).toContain("Add login");
    expect(brief).toContain("My App");
    expect(brief).toContain("Full brief body.");
  });

  it("preserves a huge description verbatim", () => {
    const huge = "x".repeat(200_000);
    const brief = buildTaskBrief("My App", { ...task, description: huge });
    expect(brief).toContain(huge);
  });
});

describe("buildTaskInstruction", () => {
  it("is a single line referencing the brief path and task id", () => {
    const line = buildTaskInstruction("My App", task, "/tmp/brief.md");
    expect(line).toContain("OE-3");
    expect(line).toContain("My App");
    expect(line).toContain("/tmp/brief.md");
    expect(line).not.toContain("\n");
  });
});
