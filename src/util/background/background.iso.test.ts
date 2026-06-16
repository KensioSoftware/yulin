import { describe, it, vi } from "vitest";
import {
  BackgroundTasks,
  NonDeterministicBackgroundTasks,
} from "./background.js";
import {
  assertFalse,
  assertIdentical,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";

describe("background sequencing", () => {
  describe("BackgroundTasks", () => {
    it("executes scheduled tasks", async () => {
      const tasks = new BackgroundTasks();
      let executed = false;

      tasks.schedule(async () => {
        await Promise.resolve();
        executed = true;
      });

      assertFalse(executed);
      await tasks.complete();
      assertTrue(executed);
    });

    it("tracks pending task count", async () => {
      const tasks = new BackgroundTasks();

      assertIdentical(tasks.size, 0);

      tasks.schedule(async () => {
        /* empty */
      });
      tasks.schedule(async () => {
        /* empty */
      });
      tasks.schedule(async () => {
        /* empty */
      });

      assertIdentical(tasks.size, 3);
      await tasks.complete();
      assertIdentical(tasks.size, 0);
    });

    it("handles tasks that schedule more tasks", async () => {
      const tasks = new BackgroundTasks();
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
      assertIdentical(execOrder.length, 2);
      assertIdentical(execOrder[0], 1);
      assertIdentical(execOrder[1], 2);
    });

    it("propagates task errors", async () => {
      const tasks = new BackgroundTasks();

      tasks.schedule(async () => {
        await Promise.resolve();
        throw new Error("Task failed");
      });

      await assertThrowsErrorAsync(async () => tasks.complete());
    });
  });

  describe("NonDeterministicBackgroundTasks", () => {
    it("executes scheduled tasks", async () => {
      const tasks = new NonDeterministicBackgroundTasks({});
      let executed = false;

      tasks.schedule(async () => {
        await Promise.resolve();
        executed = true;
      });

      assertFalse(executed);
      await tasks.complete();
      assertTrue(executed);
    });

    it("tracks pending task count", async () => {
      const tasks = new NonDeterministicBackgroundTasks({});

      assertIdentical(tasks.size, 0);

      tasks.schedule(async () => {
        /* empty */
      });
      tasks.schedule(async () => {
        /* empty */
      });
      tasks.schedule(async () => {
        /* empty */
      });

      assertIdentical(tasks.size, 3);
      await tasks.complete();
      assertIdentical(tasks.size, 0);
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
      assertIdentical(execOrder.length, 2);
      assertTrue(execOrder.includes(1));
      assertTrue(execOrder.includes(2));
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
