import { assertArrayIncludesAll, assertUndefined } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";

describe("SimSnsSdkCommandRouter", () => {
  it("names every Command simulated SNS handles", () => {
    // Given a scoped simulated SNS.
    const simAws = new SimAws();

    // When its supported Command names are asked for.
    const names = simAws.sns().sdkCommandRouter().supportedCommandNames();

    // Then each simulated operation is routable by SDK Command name.
    assertArrayIncludesAll(names, [
      "CreateTopicCommand",
      "ListTopicsCommand",
      "DeleteTopicCommand",
      "GetTopicAttributesCommand",
      "SetTopicAttributesCommand",
      "PublishCommand",
      "PublishBatchCommand",
      "SubscribeCommand",
      "UnsubscribeCommand",
      "ListSubscriptionsCommand",
      "ListSubscriptionsByTopicCommand",
      "GetSubscriptionAttributesCommand",
      "SetSubscriptionAttributesCommand",
    ]);
  });

  it("has no route for a Command it does not handle", () => {
    // Given a scoped simulated SNS.
    const simAws = new SimAws();

    // When a Command outside the simulated operations is looked up.
    const route = simAws
      .sns()
      .sdkCommandRouter()
      .route("ConfirmSubscriptionCommand");

    // Then there is none, so interception leaves it alone rather than
    // answering it with something that did nothing.
    assertUndefined(route);
  });
});
