import { describe, it } from "vitest";
import { BackgroundTasks } from "./background.js";
import {
  assertArrayLength,
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
      assertArrayLength(execOrder, 2);
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
});
