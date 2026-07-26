import { CreateUserCommand } from "@aws-sdk/client-iam";
import { describe, expect, it } from "vitest";

import { SimAws } from "./sim-aws.js";
import { SimAwsTimeNotControllable } from "./sim-aws-timekeeping.js";
import { BackgroundTasks } from "../../util/background/background.js";
import { SimFixedClock } from "../../util/clock/sim-clock.js";

const start = new Date("2026-07-26T09:00:00.000Z");

/**
 * Let real time pass, so a frozen simulated clock can be shown not to follow it.
 */
async function realTimePasses(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 10);
  });
}

describe("SimAws clock control", () => {
  it("freezes simulated time", async () => {
    // Given a simulation with its clock frozen
    const simAws = new SimAws();
    simAws.clock().freeze();
    const frozen = simAws.now();

    // When real time passes
    await realTimePasses();

    // Then the simulation still reports the same time
    expect(simAws.now()).toStrictEqual(frozen);
  });

  it("sets simulated time to an instant", async () => {
    // Given a simulation running in real time
    const simAws = new SimAws();

    // When its clock is set to an instant
    await simAws.clock().setTo(start);

    // Then that is what the simulation calls the time, and resources it creates
    // are stamped with it
    expect(simAws.now()).toStrictEqual(start);
    const output = await simAws
      .iam()
      .createUser(new CreateUserCommand({ UserName: "Clockwatcher" }));
    expect(output.User.CreateDate).toStrictEqual(start);
  });

  it("advances simulated time by a duration", async () => {
    // Given a simulation started at a known instant
    const simAws = new SimAws({ clock: new SimFixedClock(start) });

    // When its clock is advanced
    await simAws.clock().advanceBy({ hours: 1, minutes: 30 });

    // Then simulated time has moved on by that duration
    expect(simAws.now()).toStrictEqual(new Date("2026-07-26T10:30:00.000Z"));
  });

  it("carries on in real time from an advanced instant when resumed", async () => {
    // Given a simulation advanced a year ahead
    const simAws = new SimAws();
    await simAws.clock().advanceBy({ days: 365 });
    const advanced = simAws.now();

    // When its clock is resumed and real time passes
    simAws.clock().resume();
    await realTimePasses();

    // Then simulated time is running again from where it was advanced to
    expect(simAws.now().getTime()).toBeGreaterThan(advanced.getTime());
    expect(simAws.now().getTime() - advanced.getTime()).toBeLessThan(1000);
  });

  it("keeps one simulation's time control out of another's", async () => {
    // Given two simulations, only one of which has its time moved
    const moved = new SimAws();
    const untouched = new SimAws();
    const realBefore = Date.now();

    // When one is advanced by a year
    await moved.clock().advanceBy({ days: 365 });

    // Then the other, and the real clock, are where they were
    expect(moved.now().getTime() - realBefore).toBeGreaterThan(
      364 * 24 * 60 * 60 * 1000,
    );
    expect(Math.abs(untouched.now().getTime() - Date.now())).toBeLessThan(1000);
    expect(Date.now() - realBefore).toBeLessThan(1000);
  });

  it("refuses time control when it does not own its clock", () => {
    // Given a simulation constructed with a background scheduler of its own,
    // which brings its own clock
    const simAws = new SimAws({ background: new BackgroundTasks() });

    // When time control is asked for
    // Then it is refused, rather than silently controlling nothing
    expect(() => simAws.clock()).toThrow(SimAwsTimeNotControllable);
    expect(() => simAws.clock()).toThrow(/background scheduler/);
  });
});
