import { describe, expect, it } from "vitest";

import { BackgroundTasks } from "../background/background.js";
import { SimClockControl } from "./sim-clock-control.js";
import { SimControllableClock } from "./sim-controllable-clock.js";
import { SimFixedClock, type SimClock } from "./sim-clock.js";

const start = new Date("2026-07-26T09:00:00.000Z");

/**
 * A host clock that reads a hundred milliseconds later every time it is asked,
 * standing in for a machine busy enough to be preempted mid-advance.
 */
class DriftingClock implements SimClock {
  private at = start.getTime();

  now(): Date {
    this.at += 100;

    return new Date(this.at);
  }
}

/**
 * A simulation's clock, its scheduler, and control over both, wired the way
 * SimAws wires them.
 */
function simulatedTime(): {
  control: SimClockControl;
  background: BackgroundTasks;
} {
  const clock = new SimControllableClock({ base: new SimFixedClock(start) });
  const background = new BackgroundTasks({ clock });

  return { control: new SimClockControl({ clock, background }), background };
}

describe("SimClockControl", () => {
  it("reports the simulation's time and whether it is frozen", () => {
    // Given control over a simulation's clock
    const { control } = simulatedTime();

    // When it is frozen and read
    expect(control.isFrozen).toBe(false);
    control.freeze();

    // Then it reports the simulated time, standing still
    expect(control.now()).toStrictEqual(start);
    expect(control.isFrozen).toBe(true);

    // And it can be set running again
    control.resume();
    expect(control.isFrozen).toBe(false);
  });

  it("advances simulated time by a duration", async () => {
    // Given control over a simulation's clock
    const { control } = simulatedTime();

    // When time is advanced
    await control.advanceBy({ minutes: 20 });

    // Then simulated time has moved on, and stopped there
    expect(control.now()).toStrictEqual(new Date("2026-07-26T09:20:00.000Z"));
    expect(control.isFrozen).toBe(true);
  });

  it("measures an advance from where the clock stood when it started", async () => {
    // Given a simulation on a host clock that moves while an advance runs, and
    // work due now that buffers for an hour once it runs
    const clock = new SimControllableClock({ base: new DriftingClock() });
    const background = new BackgroundTasks({ clock });
    const control = new SimClockControl({ clock, background });
    let delivered = false;
    background.scheduleAt(background.now(), async () => {
      background.scheduleAt(
        new Date(background.now().getTime() + 60 * 60 * 1000),
        async () => {
          delivered = true;

          await Promise.resolve();
        },
      );

      await Promise.resolve();
    });

    // When time is advanced by exactly that hour
    await control.advanceBy({ hours: 1 });

    // Then the hour reached the buffer's due instant. The host clock moving
    // under the advance left the interval the length it was asked for.
    expect(delivered).toBe(true);
  });

  it("runs work that falls due during the interval, at its own due time", async () => {
    // Given work scheduled for ten past nine
    const { control, background } = simulatedTime();
    const ranAt: Date[] = [];
    background.scheduleAt(new Date("2026-07-26T09:10:00.000Z"), async () => {
      ranAt.push(control.now());

      await Promise.resolve();
    });

    // When time is advanced past it
    await control.advanceBy({ minutes: 20 });

    // Then it ran, seeing the time it was due rather than the time advanced to
    expect(ranAt).toStrictEqual([new Date("2026-07-26T09:10:00.000Z")]);
    expect(control.now()).toStrictEqual(new Date("2026-07-26T09:20:00.000Z"));
  });

  it("leaves work that is not yet due alone", async () => {
    // Given work scheduled for an hour away
    const { control, background } = simulatedTime();
    let ran = false;
    background.scheduleAt(new Date("2026-07-26T10:00:00.000Z"), async () => {
      ran = true;

      await Promise.resolve();
    });

    // When time is advanced, but not far enough
    await control.advanceBy({ minutes: 20 });

    // Then it has not run, and is still waiting for the clock
    expect(ran).toBe(false);
    expect(background.dueTaskCount).toBe(1);
  });

  it("runs everything due in the interval in due order", async () => {
    // Given work scheduled out of order across the interval
    const { control, background } = simulatedTime();
    const ran: string[] = [];
    const record = (name: string) => async (): Promise<void> => {
      ran.push(name);

      await Promise.resolve();
    };
    background.scheduleAt(
      new Date("2026-07-26T09:30:00.000Z"),
      record("half past"),
    );
    background.scheduleAt(
      new Date("2026-07-26T09:10:00.000Z"),
      record("ten past"),
    );

    // When time is advanced past both
    await control.advanceBy({ hours: 1 });

    // Then they ran in the order simulated time reached them
    expect(ran).toStrictEqual(["ten past", "half past"]);
  });

  it("returns only once work triggered during the interval has settled", async () => {
    // Given due work that itself schedules more background work
    const { control, background } = simulatedTime();
    const ran: string[] = [];
    background.scheduleAt(new Date("2026-07-26T09:10:00.000Z"), async () => {
      ran.push("due task");
      background.schedule(async () => {
        ran.push("follow-up");

        await Promise.resolve();
      });

      await Promise.resolve();
    });

    // When time is advanced past it
    await control.advanceBy({ minutes: 20 });

    // Then the cascade has settled by the time advancing returns
    expect(ran).toStrictEqual(["due task", "follow-up"]);
    expect(background.pendingTaskCount).toBe(0);
  });

  it("runs work a due task schedules for later in the same interval", async () => {
    // Given due work that schedules further work still inside the interval
    const { control, background } = simulatedTime();
    const ran: string[] = [];
    background.scheduleAt(new Date("2026-07-26T09:10:00.000Z"), async () => {
      ran.push("first");
      background.scheduleAt(new Date("2026-07-26T09:15:00.000Z"), async () => {
        ran.push("second");

        await Promise.resolve();
      });

      await Promise.resolve();
    });

    // When time is advanced past both
    await control.advanceBy({ minutes: 20 });

    // Then the work scheduled along the way ran too
    expect(ran).toStrictEqual(["first", "second"]);
    expect(background.dueTaskCount).toBe(0);
  });

  it("crosses a long interval without waiting on a real timer per turn", async () => {
    // Given work that takes a turn every simulated minute
    const { control, background } = simulatedTime();
    let turns = 0;
    const everyMinute = async (): Promise<void> => {
      turns += 1;
      background.scheduleAt(
        new Date(control.now().getTime() + 60_000),
        everyMinute,
      );

      await Promise.resolve();
    };
    background.scheduleAt(new Date(start.getTime() + 60_000), everyMinute);

    // When simulated time is advanced by a week
    const realBefore = Date.now();
    await control.advanceBy({ days: 7 });

    // Then it took every one of its turns, in less host time than one real
    // timer apiece would have cost
    expect(turns).toBe(7 * 24 * 60);
    expect(Date.now() - realBefore).toBeLessThan(5000);
  });

  it("runs overdue work without dragging simulated time backwards", async () => {
    // Given work whose due time has already passed
    const { control, background } = simulatedTime();
    await control.advanceBy({ hours: 1 });
    const ranAt: Date[] = [];
    background.scheduleAt(new Date("2026-07-26T09:05:00.000Z"), async () => {
      ranAt.push(control.now());

      await Promise.resolve();
    });

    // When time is advanced again
    await control.advanceBy({ minutes: 5 });

    // Then it runs at the current simulated time, not at the instant it missed
    expect(ranAt).toStrictEqual([new Date("2026-07-26T10:00:00.000Z")]);
  });

  it("sets simulated time to an instant", async () => {
    // Given control over a simulation's clock
    const { control } = simulatedTime();

    // When time is set to an instant
    await control.setTo(new Date("2027-01-01T00:00:00.000Z"));

    // Then that is what the simulation now calls the time
    expect(control.now()).toStrictEqual(new Date("2027-01-01T00:00:00.000Z"));
  });

  it("surfaces a due task that fails, stopping the clock where it failed", async () => {
    // Given due work that throws, followed by more work later in the interval
    const { control, background } = simulatedTime();
    background.scheduleAt(new Date("2026-07-26T09:10:00.000Z"), async () => {
      await Promise.resolve();

      throw new Error("Scheduled work failed");
    });
    let laterRan = false;
    background.scheduleAt(new Date("2026-07-26T09:15:00.000Z"), async () => {
      laterRan = true;

      await Promise.resolve();
    });

    // When time is advanced past both
    const advance = control.advanceBy({ minutes: 20 });

    // Then the failure surfaces to whoever advanced, rather than being lost in
    // the background
    await expect(advance).rejects.toThrow("Scheduled work failed");

    // And simulated time stopped where it broke, with the work that never got
    // its turn still queued rather than discarded
    expect(control.now()).toStrictEqual(new Date("2026-07-26T09:10:00.000Z"));
    expect(laterRan).toBe(false);
    expect(background.dueTaskCount).toBe(1);
  });

  it("runs nothing when simulated time is set backwards", async () => {
    // Given overdue work, with the clock already past it
    const { control, background } = simulatedTime();
    await control.advanceBy({ hours: 2 });
    let ran = false;
    background.scheduleAt(new Date("2026-07-26T09:30:00.000Z"), async () => {
      ran = true;

      await Promise.resolve();
    });

    // When time is set back to an instant after that work was due
    await control.setTo(new Date("2026-07-26T10:00:00.000Z"));

    // Then nothing ran: going back in time does not make things happen
    expect(ran).toBe(false);
    expect(background.dueTaskCount).toBe(1);
  });
});
