import {
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimLambdaNoEventSourceQueues } from "./sim-lambda-event-source-queues.js";

const queueArn = "arn:aws:sqs:eu-west-2:111111111111:orders";
const request = {
  queueArn,
  caller: { kind: "arn", arn: "arn:aws:iam::111111111111:role/Consumer" },
} as const;

describe("sim Lambda event source queues with no simulated SQS", () => {
  it("refuses every poll operation, saying how to reach a queue", async () => {
    // Given a simulated Lambda with no simulated SQS behind it.
    const queues = new SimLambdaNoEventSourceQueues();

    // When each polling operation is attempted.
    const errors = await Promise.all([
      assertThrowsErrorAsync(async () => {
        await queues.visibilityTimeoutSeconds(request);
      }),
      assertThrowsErrorAsync(async () => {
        await queues.receive({ ...request, batchSize: 10 });
      }),
      assertThrowsErrorAsync(async () => {
        await queues.deleteMessages({ ...request, receiptHandles: ["one"] });
      }),
    ]);

    // Then each says there is nothing to poll, and how to fix it.
    for (const error of errors) {
      assertStringIncludes(error.message, "no simulated SQS to poll");
      assertStringIncludes(error.message, queueArn);
    }
  });

  it("watches nothing, because there is no queue to watch", () => {
    // Given a simulated Lambda with no simulated SQS behind it.
    const queues = new SimLambdaNoEventSourceQueues();

    // When a poller watches a queue, asks when to look again, and stops.
    queues.watch();

    const availability = queues.nextAvailability();

    queues.unwatch();

    // Then it never has anything to come back for.
    assertUndefined(availability);
  });
});
