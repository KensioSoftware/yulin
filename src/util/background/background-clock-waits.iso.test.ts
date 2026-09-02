import {
  assertFalse,
  assertIdentical,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { BackgroundTasks } from "./background.js";
import { NonDeterministicBackgroundTasks } from "./non-deterministic-background.js";

describe("work a background scheduler is waiting for", () => {
  it("waits for work a caller started rather than handed over", async () => {
    // Given work a caller is holding the promise of.
    const tasks = new BackgroundTasks();
    const held = Promise.withResolvers<undefined>();
    let finished = false;
    const work = tasks.outstanding(async () => {
      await held.promise;
      finished = true;

      return "done";
    });

    // When the simulation is asked to settle and the work can finish.
    assertIdentical(tasks.pendingTaskCount, 1);
    held.resolve(undefined);
    await tasks.complete();

    // Then it waited for it, and the caller still has what it answered with.
    assertTrue(finished);
    assertIdentical(await work, "done");
  });

  it("leaves a caller's failure to the caller", async () => {
    // Given work a caller started that fails.
    const tasks = new BackgroundTasks();
    const work = tasks.outstanding(async () => {
      await Promise.resolve();

      throw new Error("the caller's own problem");
    });

    // When the simulation is asked to settle.
    // Then nothing failed here: whoever asked for the work is told, and
    // reporting it twice would fail a caller who never asked.
    await tasks.complete();
    await assertThrowsErrorAsync(async () => await work);
  });

  it("counts work already running as a task where it is", async () => {
    // Given a scheduled task that starts work of its own.
    const tasks = new BackgroundTasks();
    let counted = 0;
    tasks.schedule(async () => {
      await tasks.outstanding(async () => {
        counted = tasks.pendingTaskCount;

        await Promise.resolve();
      });
    });

    // When it runs.
    await tasks.complete();

    // Then the work counts once: it is part of the task, not beside it.
    assertIdentical(counted, 1);
  });

  it("leaves out the work asking it to settle", async () => {
    // Given work that asks the simulation to settle from inside itself, as a
    // handler moving the clock does.
    const tasks = new BackgroundTasks();
    let settled = false;

    // When it asks.
    await tasks.outstanding(async () => {
      await tasks.complete();
      settled = true;
    });

    // Then it came back rather than waiting for itself to finish.
    assertTrue(settled);
  });

  it("stops waiting for a task while it waits on the clock", async () => {
    // Given a task that goes on to wait for something only the clock brings.
    const tasks = new BackgroundTasks();
    const held = Promise.withResolvers<undefined>();
    let release = (): void => {
      //
    };
    let finished = false;
    tasks.schedule(async () => {
      release = tasks.waitingOnClock();
      await held.promise;
      finished = true;
    });

    // When the simulation is asked to settle.
    await tasks.complete();

    // Then it came back with the task still running: waiting for it would be
    // waiting for a clock that only moves once this returns.
    assertFalse(finished);

    // And it waits for the task again once the task is not waiting on the
    // clock any more.
    release();
    held.resolve(undefined);
    await tasks.complete();
    assertTrue(finished);
  });

  it("changes nothing said from outside a task", () => {
    // Given a scheduler with nothing running.
    const tasks = new BackgroundTasks();

    // When code that is not part of any task says it is waiting on the clock.
    const release = tasks.waitingOnClock();
    release();

    // Then there was nothing to stop waiting for.
    assertIdentical(tasks.pendingTaskCount, 0);
  });

  it("runs a task that is already due without waiting for the host", async () => {
    // Given a scheduler and a task the clock has reached.
    const tasks = new BackgroundTasks();
    let ran = false;

    // When it is run as due work.
    tasks.runDue(async () => {
      ran = true;

      await Promise.resolve();
    });

    // Then it started there and then, rather than on the next turn of the
    // host event loop, which is what keeps a long advance cheap.
    assertTrue(ran);
    await tasks.complete();
  });

  it("surfaces a failure from work that was already due", async () => {
    // Given a due task that fails.
    const tasks = new BackgroundTasks();
    tasks.runDue(async () => {
      await Promise.resolve();

      throw new Error("due task failed");
    });

    // When the simulation is asked to settle.
    // Then the failure comes out here, because nobody else is holding it.
    await assertThrowsErrorAsync(async () => {
      await tasks.complete();
    });
  });

  it("stops waiting for a task waiting on the clock out of sequence too", async () => {
    // Given the same, on the scheduler that lets work finish out of order.
    const tasks = new NonDeterministicBackgroundTasks({ maxJitterMs: 1 });
    const held = Promise.withResolvers<undefined>();
    let release = (): void => {
      //
    };
    let finished = false;
    tasks.schedule(async () => {
      release = tasks.waitingOnClock();
      await held.promise;
      finished = true;
    });

    // When the simulation is asked to settle, and then asked again once the
    // task is no longer waiting on the clock.
    await tasks.complete();
    assertFalse(finished);

    release();
    held.resolve(undefined);
    await tasks.complete();

    // Then it waited the second time and not the first.
    assertTrue(finished);
  });

  it("runs due work out of sequence too", async () => {
    // Given the scheduler that lets work finish out of order.
    const tasks = new NonDeterministicBackgroundTasks({ maxJitterMs: 1 });
    let ran = false;

    // When a task the clock has reached is run, and work a caller started
    // fails beside it.
    tasks.runDue(async () => {
      ran = true;

      await Promise.resolve();
    });
    const work = tasks.outstanding(async () => {
      await Promise.resolve();

      throw new Error("the caller's own problem");
    });

    // Then the due task ran, and the caller's failure stayed the caller's.
    assertTrue(ran);
    await tasks.complete();
    await assertThrowsErrorAsync(async () => await work);
  });
});
