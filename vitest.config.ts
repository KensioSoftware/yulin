import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "#test": fileURLToPath(new URL("./test", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    typecheck: {
      tsconfig: "./tsconfig.json",
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [...configDefaults.exclude],
      reporter: ["text", "json-summary"],
      reportsDirectory: "./test/.coverage",
      thresholds: {
        statements: 99,
        branches: 95,
        functions: 99,
        lines: 99,
      },
    },
    restoreMocks: true,
    testTimeout: 10_000,
    projects: [
      {
        extends: true,
        test: {
          name: "isolatedTests",
          include: ["src/**/*.iso.test.ts"],
          // globalSetup: ["./test/isoTestGlobalSetUp.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "localTests",
          include: ["src/**/*.loc.test.ts"],
          // Local tests spawn real processes, bind real ports and wait on real
          // filesystem events. On a loaded CI runner that is seconds where a
          // developer machine takes a fraction of one, so they get longer than
          // an isolated test does before a slow run counts as a hang.
          testTimeout: 30_000,
          // globalSetup: ["./test/locTestGlobalSetUp.ts"],
        },
      },
    ],
  },
});
