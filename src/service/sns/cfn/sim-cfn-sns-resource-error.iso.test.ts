import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimSnsInvalidParameterException } from "../error/sim-sns.error.js";
import { simCfnSnsResourceCreation } from "./sim-cfn-sns-resource-error.js";
import { snsTopicResourceType } from "./sim-cfn-sns-resource-types.js";

describe("simCfnSnsResourceCreation", () => {
  it("names the Resource in what simulated SNS refused", async () => {
    // Given creation work refused by simulated SNS, whose error carries the
    // reason and no idea which Resource asked for it.
    const refused = (): Promise<never> =>
      Promise.reject(
        new SimSnsInvalidParameterException("Invalid parameter: Name"),
      );

    // When it is run as one Resource's creation, then the refusal says which
    // Resource it was.
    const error = await assertThrowsErrorAsync(async () =>
      simCfnSnsResourceCreation(snsTopicResourceType, "OrdersTopic", refused),
    );

    assertIdentical(
      error.message,
      "Invalid AWS::SNS::Topic Resource OrdersTopic: Invalid parameter: Name",
    );
    assertInstanceOf(error.cause, SimSnsInvalidParameterException);
  });

  it("leaves an error that is not SNS's alone", async () => {
    // Given creation work failing for a reason that is not a refusal, such as
    // an assertion about the simulator's own state.
    const broke = (): Promise<never> =>
      Promise.reject(new TypeError("something else went wrong"));

    // When it is run as one Resource's creation, then the error comes through
    // as it was, rather than being reworded as a refused Resource.
    const error = await assertThrowsErrorAsync(async () =>
      simCfnSnsResourceCreation(snsTopicResourceType, "OrdersTopic", broke),
    );

    assertIdentical(error.message, "something else went wrong");
  });

  it("hands back what the creation work answered with", async () => {
    // Given creation work that succeeds.
    const created = await simCfnSnsResourceCreation(
      snsTopicResourceType,
      "OrdersTopic",
      () => Promise.resolve("the topic"),
    );

    assertIdentical(created, "the topic");
  });
});
