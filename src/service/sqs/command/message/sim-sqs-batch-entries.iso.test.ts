import {
  assertArrayEquals,
  assertIdentical,
  assertInstanceOf,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimSqsInvalidParameterValue } from "../../error/sim-sqs.error.js";
import { requireBatchEntries, runBatch } from "./sim-sqs-batch-entries.js";

describe("SQS batch entries", () => {
  it("keeps every entry under the id it was given", () => {
    // Given two entries.
    const entries = requireBatchEntries(
      [{ Id: "one" }, { Id: "two" }],
      "SendMessage",
    );

    // When each is run.
    const outcome = runBatch(entries, (_entry, id) => id);

    // Then each result is reported under its own entry id.
    assertArrayEquals(outcome.successful, ["one", "two"]);
    assertArrayEquals(outcome.failed, []);
  });

  it("reports an SQS failure as one entry's own", () => {
    // Given one entry whose work fails the way SQS fails.
    const entries = requireBatchEntries([{ Id: "one" }], "SendMessage");

    // When it is run.
    const outcome = runBatch(entries, () => {
      throw new SimSqsInvalidParameterValue("no good");
    });

    // Then the failure belongs to the entry rather than the request.
    assertIdentical(outcome.failed.at(0)?.Code, "InvalidParameterValue");
    assertIdentical(outcome.failed.at(0)?.Message, "no good");
  });

  it("lets a failure that is not an SQS failure take the request down", () => {
    // Given one entry whose work fails for a reason that is not about the entry,
    // as an IAM denial would.
    const entries = requireBatchEntries([{ Id: "one" }], "SendMessage");

    // When it is run.
    const error = assertThrowsError(() => {
      runBatch(entries, () => {
        throw new Error("not authorized to perform sqs:SendMessage");
      });
    });

    // Then it is not reported as an entry failure: the whole request fails.
    assertInstanceOf(error, Error);
    assertIdentical(error.message, "not authorized to perform sqs:SendMessage");
  });
});
