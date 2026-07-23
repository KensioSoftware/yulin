import { describe, it, vi } from "vitest";
import {
  assertArrayIncludesAll,
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { NonDeterministicBackgroundTasks } from "./non-deterministic-background.js";

describe("background sequencing", () => {
  describe("NonDeterministicBackgroundTasks", () => {
    it("executes scheduled tasks", async () => {
      const tasks = new NonDeterministicBackgroundTasks({});
      let isExecuted = false;

      tasks.schedule(async () => {
        await Promise.resolve();
        isExecuted = true;
      });

      assertFalse(isExecuted);
      await tasks.complete();
      assertTrue(isExecuted);
    });

    it("tracks pending task count", async () => {
      const tasks = new NonDeterministicBackgroundTasks({});

      assertIdentical(tasks.pendingTaskCount, 0);

      tasks.schedule(async () => {
        /* empty */
      });
      tasks.schedule(async () => {
        /* empty */
      });
      tasks.schedule(async () => {
        /* empty */
      });

      assertIdentical(tasks.pendingTaskCount, 3);
      await tasks.complete();
      assertIdentical(tasks.pendingTaskCount, 0);
    });

    it("can execute scheduled tasks out of scheduling order", async () => {
      const random = vi.spyOn(Math, "random");
      random.mockReturnValueOnce(1);
      random.mockReturnValueOnce(0);

      try {
        const tasks = new NonDeterministicBackgroundTasks();
        const execOrder: number[] = [];

        tasks.schedule(async () => {
          execOrder.push(1);
          await Promise.resolve();
        });
        tasks.schedule(async () => {
          execOrder.push(2);
          await Promise.resolve();
        });

        await tasks.complete();

        assertIdentical(execOrder[0], 2);
        assertIdentical(execOrder[1], 1);
      } finally {
        random.mockRestore();
      }
    });

    it("handles tasks that schedule more tasks", async () => {
      const tasks = new NonDeterministicBackgroundTasks({});
      const execOrder: number[] = [];

      tasks.schedule(async () => {
        await Promise.resolve();
        execOrder.push(1);
        tasks.schedule(async () => {
          await Promise.resolve();
          execOrder.push(2);
        });
      });

      await tasks.complete();
      assertArrayLength(execOrder, 2);
      assertArrayIncludesAll(execOrder, [1, 2]);
    });

    it("propagates task errors", async () => {
      const tasks = new NonDeterministicBackgroundTasks({});

      tasks.schedule(async () => {
        await Promise.resolve();
        throw new Error("Task failed");
      });

      await assertThrowsErrorAsync(async () => tasks.complete());
    });
  });
});
