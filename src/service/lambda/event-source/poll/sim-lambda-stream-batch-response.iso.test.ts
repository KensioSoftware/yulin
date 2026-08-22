import { assertIdentical, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";

import type { SimLambdaEventSourceStreamPosition } from "../stream/sim-lambda-event-source-streams.js";
import { SimLambdaStreamBatchResponse } from "./sim-lambda-stream-batch-response.js";

/**
 * Where the mapping read this batch from, which is where a batch that failed
 * whole is read again from.
 */
const readFrom: SimLambdaEventSourceStreamPosition = {
  kind: "iterator",
  shardIterator: "iterator-1",
};

/**
 * The sequence numbers one batch carried, in stream order.
 */
const records: readonly string[] = ["100", "200", "300"];

/**
 * The sequence number the next read starts at, or the iterator it starts from
 * when the batch goes back whole.
 */
function retryFrom(position: SimLambdaEventSourceStreamPosition): string {
  if (position.kind === "sequence") {
    return position.sequenceNumber;
  }

  return "read from where it was";
}

describe("sim Lambda stream batch responses", () => {
  it("goes back to the lowest sequence number a report names", () => {
    // Given a mapping expecting a failure report.
    const response = new SimLambdaStreamBatchResponse(true);

    // When the function reports the last two records, out of order.
    const outcome = response.handled(records, {
      batchItemFailures: [{ itemIdentifier: "300" }, { itemIdentifier: "200" }],
    });

    // Then reading goes back to the earlier of them, so the record after it is
    // delivered again even though the function did not name it. That is the
    // checkpoint rewind AWS documents, and the reason a stream consumer has to
    // be idempotent.
    assertIdentical(retryFrom(outcome.retryPosition(readFrom)), "200");
  });

  it("keeps the whole batch when the mapping expects no failure report", () => {
    // Given a mapping the function does not report batch item failures to.
    const response = new SimLambdaStreamBatchResponse(false);

    // When the function returns a report anyway.
    const outcome = response.handled(records, {
      batchItemFailures: [{ itemIdentifier: "100" }],
    });

    // Then it is ignored, as real Lambda ignores one it was not told to
    // expect.
    assertTrue(outcome.isHandled);
  });

  it("keeps the whole batch for a report naming nothing", () => {
    // Given a mapping expecting a failure report.
    const response = new SimLambdaStreamBatchResponse(true);

    // When the function returns an empty report.
    const outcome = response.handled(records, { batchItemFailures: [] });

    // Then the batch is finished with.
    assertTrue(outcome.isHandled);
  });

  it("reads the whole batch again for a report naming a record outside it", () => {
    // Given a mapping expecting a failure report.
    const response = new SimLambdaStreamBatchResponse(true);

    // When the function names a sequence number that was not in the batch.
    const outcome = response.handled(records, {
      batchItemFailures: [{ itemIdentifier: "400" }],
    });

    // Then the whole batch goes over again rather than guessing which record
    // was meant. Guessing wrong on a stream skips records rather than
    // repeating them.
    assertIdentical(
      retryFrom(outcome.retryPosition(readFrom)),
      "read from where it was",
    );
  });

  it("reads the whole batch again for an entry with no sequence number", () => {
    // Given a mapping expecting a failure report.
    const response = new SimLambdaStreamBatchResponse(true);

    // When the function reports an entry whose identifier is empty.
    const outcome = response.handled(records, {
      batchItemFailures: [{ itemIdentifier: "" }],
    });

    // Then the whole batch goes over again.
    assertIdentical(
      retryFrom(outcome.retryPosition(readFrom)),
      "read from where it was",
    );
  });

  it("names no record for a batch whose records carry no sequence number", () => {
    // Given a mapping expecting a failure report, and a batch whose records the
    // stream handed over without sequence numbers, so none can be named.
    const response = new SimLambdaStreamBatchResponse(true);

    // When the function reports an entry naming nothing.
    const outcome = response.handled([], {
      batchItemFailures: [{ itemIdentifier: "" }],
    });

    // Then a record with nothing to name it is not named by an empty
    // identifier: the batch goes over again whole.
    assertIdentical(
      retryFrom(outcome.retryPosition(readFrom)),
      "read from where it was",
    );
  });

  it("reads the whole batch again when the function threw", () => {
    // Given a mapping expecting a failure report.
    const response = new SimLambdaStreamBatchResponse(true);

    // When the function threw rather than returning anything.
    const outcome = response.failed();

    // Then the batch is read again from where it was.
    assertIdentical(
      retryFrom(outcome.retryPosition(readFrom)),
      "read from where it was",
    );
  });
});
