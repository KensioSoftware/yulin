import { assertIdentical, assertNumberBetween } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimFixedClock } from "../../../../util/clock/sim-clock.js";
import { SimControllableClock } from "../../../../util/clock/sim-controllable-clock.js";
import { simLambdaProcessClock } from "./sim-lambda-process-clock.js";

const instant = new Date("2026-01-01T00:00:00.000Z");
const laterInstant = new Date("2026-06-01T12:00:00.000Z");

/**
 * Resolve after a real pause, so a test can interleave two runs and prove
 * they do not see each other's time.
 */
async function tick(milliseconds: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

/**
 * How far a reading is from the untouched host clock.
 */
function driftFromHost(milliseconds: number): number {
  const hostDate = simLambdaProcessClock.hostDateConstructor();

  return Math.abs(milliseconds - new hostDate().getTime());
}

describe("sim Lambda process clock", () => {
  it("gives the run the simulation's time", async () => {
    // Given a simulation stopped at a known instant.
    const clock = new SimFixedClock(instant);

    // When the time is read inside the run.
    const insideRun = await simLambdaProcessClock.run(clock, () =>
      Promise.resolve({ from: Date.now(), built: new Date().toISOString() }),
    );

    // Then both ways of asking got the simulation's time.
    assertIdentical(insideRun.from, instant.getTime());
    assertIdentical(insideRun.built, "2026-01-01T00:00:00.000Z");
  });

  it("leaves the host clock alone outside a run", async () => {
    // Given a run that has installed the substitute Date.
    await simLambdaProcessClock.run(new SimFixedClock(instant), () =>
      Promise.resolve(),
    );

    // When the time is read with no run in progress.
    const outsideRun = Date.now();

    // Then it is the host's time: an installed substitute with nothing
    // running behaves exactly like no substitute at all.
    assertNumberBetween(driftFromHost(outsideRun), 0, 1000);
  });

  it("keeps the run's time across an await", async () => {
    // Given a run reading the time on both sides of an await.
    const read = await simLambdaProcessClock.run(
      new SimFixedClock(instant),
      async () => {
        const before = Date.now();
        await tick(2);
        return { before, after: Date.now() };
      },
    );

    // Then asynchronous context tracking carried the clock across it.
    assertIdentical(read.before, instant.getTime());
    assertIdentical(read.after, instant.getTime());
  });

  it("keeps concurrent runs apart", async () => {
    // Given two runs of different simulations, overlapping in time.
    const [first, second] = await Promise.all([
      simLambdaProcessClock.run(new SimFixedClock(instant), async () => {
        await tick(5);
        return Date.now();
      }),
      simLambdaProcessClock.run(new SimFixedClock(laterInstant), () =>
        Promise.resolve(Date.now()),
      ),
    ]);

    // Then each read its own simulation's clock.
    assertIdentical(first, instant.getTime());
    assertIdentical(second, laterInstant.getTime());
  });

  it("follows a clock that moves between runs", async () => {
    // Given a controllable clock stopped at a known instant.
    const clock = new SimControllableClock();
    clock.setTo(instant);
    const before = await simLambdaProcessClock.run(clock, () =>
      Promise.resolve(Date.now()),
    );

    // When it is advanced between two runs.
    clock.advanceBy({ hours: 2 });
    const after = await simLambdaProcessClock.run(clock, () =>
      Promise.resolve(Date.now()),
    );

    // Then the second run saw the advanced time.
    assertIdentical(before, instant.getTime());
    assertIdentical(after, instant.getTime() + 2 * 60 * 60 * 1000);
  });

  it("does not re-enter a clock that reads the host clock", async () => {
    // Given a clock that is running rather than frozen, so answering what
    // time it is means asking the host clock, through the very Date the run
    // has substituted.
    const clock = new SimControllableClock();

    // When the time is read inside the run.
    const insideRun = await simLambdaProcessClock.run(clock, () =>
      Promise.resolve(Date.now()),
    );

    // Then the read terminated, with the host's time.
    assertNumberBetween(driftFromHost(insideRun), 0, 1000);
  });
});
