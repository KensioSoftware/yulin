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
    include: ["src/**/*.test.ts"],
    typecheck: {
      tsconfig: "./tsconfig.json",
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [...configDefaults.exclude],
      reporter: ["text", "lcov"],
      reportsDirectory: "./test/.coverage",
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
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
          // globalSetup: ["./test/locTestGlobalSetUp.ts"],
        },
      },
    ],
  },
});
