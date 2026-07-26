import { describe, it, vi } from "vitest";
import {
  assertArrayIncludesAll,
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { NonDeterministicBackgroundTasks } from "./non-deterministic-background.js";
import { SimFixedClock } from "../clock/sim-clock.js";

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

    it("reports the time of the clock it was given", () => {
      // Given a non-deterministic scheduler holding a stopped clock
      const instant = new Date("2026-07-26T09:30:00.000Z");
      const tasks = new NonDeterministicBackgroundTasks({
        clock: new SimFixedClock(instant),
      });

      // When the scheduler is asked for the time
      // Then out-of-order sequencing does not make time non-deterministic too
      assertIdentical(tasks.now().toISOString(), instant.toISOString());
    });

    it("reports the real time when given no clock", () => {
      // Given a non-deterministic scheduler with no clock of its own
      const tasks = new NonDeterministicBackgroundTasks({});

      // When the scheduler is asked for the time
      // Then it reports the real system time
      assertTrue(Math.abs(tasks.now().getTime() - Date.now()) < 1000);
    });

    it("holds work scheduled for a simulated instant until time reaches it", async () => {
      // Given work scheduled for ten o'clock
      const tasks = new NonDeterministicBackgroundTasks({});
      const dueTime = new Date("2026-07-26T10:00:00.000Z");
      let ran = false;
      tasks.scheduleAt(dueTime, async () => {
        ran = true;

        await Promise.resolve();
      });

      // When everything currently outstanding is waited for
      await tasks.complete();

      // Then the work has not run: it is waiting on the clock, not the event
      // loop, so out-of-order sequencing never releases it early
      assertFalse(ran);
      assertIdentical(tasks.dueTaskCount, 1);

      // And it comes out once simulated time reaches its due instant
      const due = tasks.takeNextDueBy(dueTime);
      assertNonNullable(due);
      assertIdentical(tasks.dueTaskCount, 0);
    });
  });
});
