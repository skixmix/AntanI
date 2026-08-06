import { describe, expect, it } from "vitest";
import { buildTaskBrief, buildTaskInstruction } from "./taskPrompt";
import type { Task } from "./types";

const task: Task = {
  id: "u1",
  taskId: "OE-3",
  title: "Add login",
  description: "Human notes.",
  prompt: "Full brief body.",
  color: null,
  status: "todo",
  createdAt: 0,
  updatedAt: 0,
  startedAt: null,
  doneAt: null,
  enteredColumnAt: null,
};

describe("buildTaskBrief", () => {
  it("includes the task id, title, project name and prompt", () => {
    const brief = buildTaskBrief("My App", task);
    expect(brief).toContain("OE-3");
    expect(brief).toContain("Add login");
    expect(brief).toContain("My App");
    expect(brief).toContain("Full brief body.");
  });

  it("sends the AI prompt, not the human notes", () => {
    const brief = buildTaskBrief("My App", {
      ...task,
      description: "secret human notes",
      prompt: "do the thing",
    });
    expect(brief).toContain("do the thing");
    expect(brief).not.toContain("secret human notes");
  });

  it("preserves a huge prompt verbatim", () => {
    const huge = "x".repeat(200_000);
    const brief = buildTaskBrief("My App", { ...task, prompt: huge });
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
