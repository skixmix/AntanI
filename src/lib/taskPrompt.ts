import type { Task } from "./types";

export function buildTaskBrief(projectName: string, task: Task): string {
  return `# ${task.taskId}: ${task.title}\n\nProject: ${projectName}\n\n${task.description}\n`;
}

export function buildTaskInstruction(projectName: string, task: Task, briefPath: string): string {
  return `You are working on task ${task.taskId} in project "${projectName}". Read the full brief at ${briefPath} and start working on it.`;
}
