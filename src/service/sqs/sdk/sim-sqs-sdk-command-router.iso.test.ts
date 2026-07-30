import { assertArrayIncludesAll, assertUndefined } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";

describe("SimSqsSdkCommandRouter", () => {
  it("names every Command simulated SQS handles", () => {
    // Given a scoped simulated SQS.
    const simAws = new SimAws();

    // When its supported Command names are asked for.
    const names = simAws.sqs().sdkCommandRouter().supportedCommandNames();

    // Then each simulated operation is routable by SDK Command name.
    assertArrayIncludesAll(names, [
      "CreateQueueCommand",
      "GetQueueUrlCommand",
      "ListQueuesCommand",
      "DeleteQueueCommand",
      "GetQueueAttributesCommand",
      "SetQueueAttributesCommand",
      "PurgeQueueCommand",
      "SendMessageCommand",
      "SendMessageBatchCommand",
      "ReceiveMessageCommand",
      "DeleteMessageCommand",
      "DeleteMessageBatchCommand",
      "ChangeMessageVisibilityCommand",
    ]);
  });

  it("has no route for a Command it does not handle", () => {
    // Given a scoped simulated SQS.
    const simAws = new SimAws();

    // When a Command outside the simulated operations is looked up.
    const route = simAws
      .sqs()
      .sdkCommandRouter()
      .route("ChangeMessageVisibilityBatchCommand");

    // Then there is no route for it.
    assertUndefined(route);
  });
});
