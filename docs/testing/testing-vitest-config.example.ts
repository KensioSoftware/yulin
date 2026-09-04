import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    projects: [
      {
        extends: true,
        test: {
          name: "shared Yulin",
          include: ["test/**/*.test.ts"],
          exclude: ["test/**/*.clock.test.ts"],
          fileParallelism: false,
          isolate: false,
          setupFiles: ["./test/setup-yulin.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "isolated Yulin clock",
          include: ["test/**/*.clock.test.ts"],
        },
      },
    ],
  },
});
