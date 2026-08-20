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
    // Test files share a worker rather than getting a fresh one each. The suite
    // is dominated by importing modules, not by running tests: with a worker
    // per file the same @aws-sdk clients are parsed hundreds of times over, and
    // that import cost was roughly five times the time the tests themselves
    // took. Sharing the worker imports them once and the cost all but vanishes.
    //
    // What makes it safe is what the simulator is for. State lives on a SimAws
    // instance a test makes and drops, not in module scope, so a file leaves
    // nothing behind for the next one to find. Nothing in the suite calls
    // vi.mock either, which is the usual reason a shared module registry goes
    // wrong. The whole suite passes in a single process, in file order and
    // shuffled, which is the strongest form of that claim available.
    //
    // Turn this back on if a test ever has to reach for module-level state —
    // and prefer changing the test, because a simulator that cannot survive a
    // shared registry is one its users cannot either.
    isolate: false,
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
          // an isolated test does before a slow run counts as a hang. This has
          // to stay above twice `watchRunTimeoutMs`, since a supervised test
          // waits for two runs of a spawned process inside one timeout.
          testTimeout: 45_000,
          // globalSetup: ["./test/locTestGlobalSetUp.ts"],
        },
      },
    ],
  },
});
