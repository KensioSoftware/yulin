import { describe, it } from "vitest";
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
      const maxAttempts = 30;
      const tasksPerAttempt = 10;

      let foundNonDeterministicOrdering = false;

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const tasks = new NonDeterministicBackgroundTasks();
        const execOrder: number[] = [];

        for (let taskIndex = 0; taskIndex < tasksPerAttempt; taskIndex += 1) {
          const scheduledTaskIndex = taskIndex;
          tasks.schedule(async () => {
            execOrder.push(scheduledTaskIndex);
            await Promise.resolve();
          });
        }

        // eslint-disable-next-line no-await-in-loop
        await tasks.complete();

        foundNonDeterministicOrdering = execOrder.some(
          (taskIndex, execIndex) => taskIndex !== execIndex,
        );

        if (foundNonDeterministicOrdering) {
          break;
        }
      }

      assertTrue(
        foundNonDeterministicOrdering,
        "Non-deterministic background sequencing",
      );
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
