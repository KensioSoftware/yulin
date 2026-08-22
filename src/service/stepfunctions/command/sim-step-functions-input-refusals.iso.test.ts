import { assertStringIncludes, assertThrowsErrorAsync } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";

const roleArn = "arn:aws:iam::123456789012:role/WorkflowRole";

const passThrough = JSON.stringify({
  StartAt: "Only",
  States: { Only: { Type: "Pass", End: true } },
});

/**
 * Answer with why a CreateStateMachine was refused.
 */
async function creationRefusalFor(
  simAws: SimAws,
  input: { readonly name: string; readonly type?: string },
): Promise<string> {
  return await refusalFor(
    async () =>
      await simAws.stepFunctions().createStateMachine({
        input: { roleArn, definition: passThrough, ...input },
      }),
  );
}

/**
 * Answer with why a call was refused.
 */
async function refusalFor(call: () => Promise<unknown>): Promise<string> {
  const error = await assertThrowsErrorAsync(call);

  return error.message;
}

describe("Simulated Step Functions input refusals", () => {
  it("refuses a CreateStateMachine input Step Functions would not take", async () => {
    // Given names carrying a colon, a space and more than 80 characters, and a
    // state machine type that does not exist.
    const simAws = new SimAws();

    // When each is used to create a state machine.
    const names = await Promise.all(
      ["Orders:Blue", "Two Words", "E".repeat(81), ""].map(
        async (name) => await creationRefusalFor(simAws, { name }),
      ),
    );
    const type = await creationRefusalFor(simAws, {
      name: "Enrolment",
      type: "SYNCHRONOUS",
    });

    // Then no ARN is built that cannot be read back, and the type is refused
    // for what it is.
    for (const refusal of names) {
      assertStringIncludes(refusal, "name");
    }

    assertStringIncludes(type, "is not a state machine type");
  });

  it("refuses a maxResults outside the range Step Functions allows", async () => {
    // Given values below, above and between whole numbers.
    const simAws = new SimAws();

    // When each is listed with.
    const refusals = await Promise.all(
      [-1, 1001, 1.5].map(
        async (maxResults) =>
          await refusalFor(
            async () =>
              await simAws
                .stepFunctions()
                .listStateMachines({ input: { maxResults } }),
          ),
      ),
    );

    for (const refusal of refusals) {
      assertStringIncludes(refusal, "whole number from 0 to 1000");
    }
  });
});
