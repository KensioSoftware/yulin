import { describe, it } from "vitest";
import { assertIdentical, assertUndefined } from "@kensio/smartass";
import { simAwsRunAsContext } from "./sim-aws-run-as-context.js";
import type { SimAwsPrincipal } from "./sim-aws-caller.js";

const callerA: SimAwsPrincipal = {
  kind: "arn",
  arn: "arn:aws:iam::111111111111:role/caller-a",
};
const callerB: SimAwsPrincipal = {
  kind: "arn",
  arn: "arn:aws:iam::222222222222:role/caller-b",
};

describe("simulated AWS run-as context", () => {
  it("has no ambient caller outside a run", () => {
    assertUndefined(simAwsRunAsContext.currentCaller({}));
  });

  it("resolves the ambient caller for the running owner", async () => {
    const owner = {};

    await simAwsRunAsContext.run(owner, callerA, () => {
      assertIdentical(simAwsRunAsContext.currentCaller(owner), callerA);
      return Promise.resolve();
    });
  });

  it("restores the outer caller after a nested run for the same owner", async () => {
    const owner = {};

    await simAwsRunAsContext.run(owner, callerA, async () => {
      await simAwsRunAsContext.run(owner, callerB, () => {
        assertIdentical(simAwsRunAsContext.currentCaller(owner), callerB);
        return Promise.resolve();
      });

      assertIdentical(simAwsRunAsContext.currentCaller(owner), callerA);
    });
  });

  it("keeps an outer owner's caller visible during a nested run for another owner", async () => {
    const ownerA = {};
    const ownerB = {};

    await simAwsRunAsContext.run(ownerA, callerA, async () => {
      await simAwsRunAsContext.run(ownerB, callerB, () => {
        assertIdentical(simAwsRunAsContext.currentCaller(ownerA), callerA);
        assertIdentical(simAwsRunAsContext.currentCaller(ownerB), callerB);
        return Promise.resolve();
      });

      assertIdentical(simAwsRunAsContext.currentCaller(ownerA), callerA);
      assertUndefined(simAwsRunAsContext.currentCaller(ownerB));
    });
  });
});
