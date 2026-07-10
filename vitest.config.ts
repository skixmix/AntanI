import { defineConfig } from "vitest/config";

// Vitest is scoped to PURE frontend logic (src/lib), not React components:
// component/IPC tests would be brittle and require mocking Tauri. UI is
// verified manually (see AGENTS.md). Environment is "node" because nothing
// under test touches the DOM.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/lib/**/*.ts"],
      exclude: ["src/**/*.{test,spec}.ts"],
    },
  },
});
