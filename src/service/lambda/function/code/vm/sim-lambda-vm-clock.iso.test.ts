import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertNonNullable,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimFixedClock } from "../../../../../util/clock/sim-clock.js";
import { SimAws } from "../../../../aws/sim-aws.js";
import { makeLambdaCodeZip } from "../make-lambda-code-zip.js";

const instant = new Date("2026-01-01T00:00:00.000Z");

/**
 * Captured before anything runs, to prove zip code never reaches it.
 */
const hostDate = Date;

/**
 * A simulation stopped at a known instant, with a zip code function that
 * reports the time JavaScript gives it.
 */
async function makeStamperSimulation(): Promise<SimAws> {
  const simAws = new SimAws({ clock: new SimFixedClock(instant) });

  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: "stamper",
      Role: "arn:aws:iam::111111111111:role/StamperRole",
      Handler: "index.handler",
      Code: {
        ZipFile: makeLambdaCodeZip(`
          exports.handler = async () => ({
            built: new Date().toISOString(),
            read: Date.now(),
            stated: new Date("2020-03-12T19:03:58.000Z").toISOString(),
            isADate: new Date() instanceof Date,
          });
        `),
      },
    }),
  );

  return simAws;
}

async function invokeStamper(simAws: SimAws): Promise<Record<string, unknown>> {
  const output = await simAws
    .lambda()
    .invoke(new InvokeCommand({ FunctionName: "stamper" }));

  assertNonNullable(output.Payload);

  return JSON.parse(Buffer.from(output.Payload).toString()) as Record<
    string,
    unknown
  >;
}

describe("sim Lambda vm code clock", () => {
  it("gives zip function code the simulation's time", async () => {
    // Given a simulation stopped at a known instant.
    const simAws = await makeStamperSimulation();

    // When function code in the vm sandbox asks JavaScript for the time.
    const stamped = await invokeStamper(simAws);

    // Then it gets the simulation's time, both ways of asking.
    assertIdentical(stamped["built"], "2026-01-01T00:00:00.000Z");
    assertIdentical(stamped["read"], instant.getTime());
  });

  it("leaves the rest of Date alone in the sandbox", async () => {
    // Given a simulation stopped at a known instant.
    const simAws = await makeStamperSimulation();

    // When function code builds a date from an instant it states itself.
    const stamped = await invokeStamper(simAws);

    // Then only the current time comes from the clock, and dates are still
    // recognisable as dates.
    assertIdentical(stamped["stated"], "2020-03-12T19:03:58.000Z");
    assertTrue(stamped["isADate"]);
  });

  it("moves with the simulation's clock between invocations", async () => {
    // Given a function that has already reported the time once.
    const simAws = await makeStamperSimulation();
    const before = await invokeStamper(simAws);

    // When the simulation's clock is advanced.
    await simAws.clock().advanceBy({ hours: 1, minutes: 30 });

    // Then the next invocation reports the advanced time, rather than the
    // time the sandbox was built at.
    const after = await invokeStamper(simAws);
    assertIdentical(before["built"], "2026-01-01T00:00:00.000Z");
    assertIdentical(after["built"], "2026-01-01T01:30:00.000Z");
  });

  it("leaves the host process's own Date alone", async () => {
    // Given a simulation whose function code has run.
    const simAws = await makeStamperSimulation();
    await invokeStamper(simAws);

    // When the host process reads its own Date.
    // Then nothing was substituted for it: the sandbox owns its globals, so
    // sandboxed code needs no global patched to see simulated time.
    assertIdentical(Date, hostDate);
  });
});
