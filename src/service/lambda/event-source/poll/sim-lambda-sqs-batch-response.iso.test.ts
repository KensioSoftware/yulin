import { assertArrayLength, assertFalse } from "@kensio/smartass";
import { describe, it } from "vitest";

import type { SimLambdaEventSourceMessage } from "../queue/sim-lambda-event-source-queues.js";
import { SimLambdaSqsBatchResponse } from "./sim-lambda-sqs-batch-response.js";

const messages: readonly SimLambdaEventSourceMessage[] = [
  {
    MessageId: "message-1",
    ReceiptHandle: "handle-1",
    MD5OfBody: "digest-1",
    Body: "order-1",
  },
  {
    MessageId: "message-2",
    ReceiptHandle: "handle-2",
    MD5OfBody: "digest-2",
    Body: "order-2",
  },
];

describe("sim Lambda SQS batch responses", () => {
  it("keeps the whole batch when the mapping expects no failure report", () => {
    // Given a mapping the function does not report batch item failures to.
    const response = new SimLambdaSqsBatchResponse(false);

    // When the function returns a report anyway.
    const outcome = response.handled(messages, {
      batchItemFailures: [{ itemIdentifier: "message-2" }],
    });

    // Then it is ignored, as real Lambda ignores one it was not told to
    // expect.
    assertArrayLength(outcome.handled, 2);
    assertFalse(outcome.hasReturnedMessages);
  });

  it("returns the whole batch for a report entry that is not an object", () => {
    // Given a mapping expecting a failure report.
    const response = new SimLambdaSqsBatchResponse(true);

    // When the function reports a bare string.
    const outcome = response.handled(messages, {
      batchItemFailures: ["message-2"],
    });

    // Then the whole batch goes back rather than guessing what was meant.
    assertArrayLength(outcome.returned, 2);
  });

  it("returns the whole batch for an entry with no message id", () => {
    // Given a mapping expecting a failure report.
    const response = new SimLambdaSqsBatchResponse(true);

    // When the function reports an entry whose identifier is not a string.
    const outcome = response.handled(messages, {
      batchItemFailures: [{ itemIdentifier: 7 }],
    });

    // Then the whole batch goes back.
    assertArrayLength(outcome.returned, 2);
  });

  it("keeps the whole batch when the function returns nothing", () => {
    // Given a mapping expecting a failure report.
    const response = new SimLambdaSqsBatchResponse(true);

    // When the function returns undefined, as a handler with no return does.
    const outcome = response.handled(messages, undefined);

    // Then the whole batch is handled.
    assertArrayLength(outcome.handled, 2);
    assertArrayLength(outcome.handledReceiptHandles, 2);
  });
});
