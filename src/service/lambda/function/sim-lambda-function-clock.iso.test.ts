import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertNonNullable,
  assertNumberBetween,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimFixedClock } from "../../../util/clock/sim-clock.js";
import { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "./code/lambda-zip-file-input.js";

const instant = new Date("2026-01-01T00:00:00.000Z");

const stamperRoleArn = "arn:aws:iam::111111111111:role/StamperRole";

/**
 * Captured before any invocation substitutes the global Date, so a test can
 * still ask what the host clock really says.
 */
const hostDate = Date;

/**
 * Resolve after a real pause, so an invocation can be suspended part way
 * through while another one runs.
 */
/**
 * Suspend for a number of turns of the host event loop.
 *
 * Not a timer: a handler's timers wait on the simulation's clock, and these
 * simulations are stopped, so a handler sleeping on one would stay asleep.
 */
async function tick(turns: number): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) {
    // oxlint-disable-next-line no-await-in-loop
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
  }
}

async function invokeStamper(simAws: SimAws): Promise<unknown> {
  const output = await simAws
    .lambda()
    .invoke(new InvokeCommand({ FunctionName: "stamper" }));

  assertNonNullable(output.Payload);

  return JSON.parse(Buffer.from(output.Payload).toString()) as unknown;
}

describe("sim Lambda in-process handler clock", () => {
  it("gives the handler the simulation's time", async () => {
    // Given a simulation stopped at a known instant, with a handler that
    // asks JavaScript for the time rather than asking the simulator.
    const simAws = new SimAws({ clock: new SimFixedClock(instant) });
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "stamper",
        Role: stamperRoleArn,
        Code: {
          ZipFile: makeLambdaZipFileInput(() => new Date().toISOString()),
        },
      }),
    );

    // When it is invoked.
    const stamped = await invokeStamper(simAws);

    // Then it stamped the simulation's time, not the host's.
    assertIdentical(stamped, "2026-01-01T00:00:00.000Z");
  });

  it("keeps the simulation's time across an await in the handler", async () => {
    // Given a handler reading the time on both sides of an await.
    const simAws = new SimAws({ clock: new SimFixedClock(instant) });
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "stamper",
        Role: stamperRoleArn,
        Code: {
          ZipFile: makeLambdaZipFileInput(async () => {
            const before = Date.now();
            await Promise.resolve();
            return { before, after: Date.now() };
          }),
        },
      }),
    );

    // When it is invoked.
    const stamped = (await invokeStamper(simAws)) as Record<string, number>;

    // Then the invocation's clock followed it across the await.
    assertIdentical(stamped["before"], instant.getTime());
    assertIdentical(stamped["after"], instant.getTime());
  });

  it("moves with the simulation's clock between invocations", async () => {
    // Given a handler that has already stamped the time once.
    const simAws = new SimAws({ clock: new SimFixedClock(instant) });
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "stamper",
        Role: stamperRoleArn,
        Code: {
          ZipFile: makeLambdaZipFileInput(() => new Date().toISOString()),
        },
      }),
    );
    const before = await invokeStamper(simAws);

    // When the simulation's clock is advanced.
    await simAws.clock().advanceBy({ hours: 1, minutes: 30 });

    // Then the next invocation stamps the advanced time.
    const after = await invokeStamper(simAws);
    assertIdentical(before, "2026-01-01T00:00:00.000Z");
    assertIdentical(after, "2026-01-01T01:30:00.000Z");
  });

  it("keeps each simulation's time to itself while they interleave", async () => {
    // Given two simulations with clocks stopped at different instants, each
    // with a handler that reads the time on the far side of an await.
    const first = new SimAws({ clock: new SimFixedClock(instant) });
    await first.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "stamper",
        Role: stamperRoleArn,
        Code: {
          ZipFile: makeLambdaZipFileInput(async () => {
            await tick(5);
            return new Date().toISOString();
          }),
        },
      }),
    );

    const laterInstant = new Date("2030-06-01T12:00:00.000Z");
    const second = new SimAws({ clock: new SimFixedClock(laterInstant) });
    await second.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "stamper",
        Role: stamperRoleArn,
        Code: {
          ZipFile: makeLambdaZipFileInput(async () => {
            await tick(1);
            return new Date().toISOString();
          }),
        },
      }),
    );

    // When both are invoked at once, so each is suspended at its await while
    // the other runs.
    const [firstStamp, secondStamp] = await Promise.all([
      invokeStamper(first),
      invokeStamper(second),
    ]);

    // Then neither picked up the other's time: each read the clock of the
    // simulation its function belongs to.
    assertIdentical(firstStamp, "2026-01-01T00:00:00.000Z");
    assertIdentical(secondStamp, "2030-06-01T12:00:00.000Z");
  });

  it("leaves the host clock alone outside an invocation", async () => {
    // Given a simulation whose handler has run, installing the substitute.
    const simAws = new SimAws({ clock: new SimFixedClock(instant) });
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "stamper",
        Role: stamperRoleArn,
        Code: {
          ZipFile: makeLambdaZipFileInput(() => new Date().toISOString()),
        },
      }),
    );
    await invokeStamper(simAws);

    // When the test itself reads the time afterwards.
    const outsideInvocation = Date.now();

    // Then it is the host's own time, untouched by the simulation.
    const drift = Math.abs(outsideInvocation - new hostDate().getTime());
    assertNumberBetween(drift, 0, 1000);
  });
});
