import { describe, it } from "vitest";
import { BackgroundTasks } from "./background.js";
import { SimFixedClock } from "../clock/sim-clock.js";
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

    it("reports the time of the clock it was given", () => {
      // Given a scheduler holding a clock stopped at a known instant
      const instant = new Date("2026-07-26T09:30:00.000Z");
      const tasks = new BackgroundTasks({ clock: new SimFixedClock(instant) });

      // When the scheduler is asked for the time
      // Then it delegates to that clock rather than reading the host clock
      assertIdentical(tasks.now().toISOString(), instant.toISOString());
    });

    it("reports the real time when given no clock", () => {
      // Given a scheduler with no clock of its own
      const tasks = new BackgroundTasks();

      // When the scheduler is asked for the time
      // Then it reports the real system time
      assertTrue(Math.abs(tasks.now().getTime() - Date.now()) < 1000);
    });
  });
});
