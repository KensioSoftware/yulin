import {
  assertArrayEquals,
  assertIdentical,
  assertInstanceOf,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimSnsInvalidParameterValueException } from "../../error/sim-sns.error.js";
import {
  requireSnsBatchEntries,
  runSnsBatch,
} from "./sim-sns-batch-entries.js";

describe("SNS batch entries", () => {
  it("keeps every entry under the id it was given", () => {
    // Given two entries.
    const entries = requireSnsBatchEntries([{ Id: "one" }, { Id: "two" }]);

    // When each is run.
    const outcome = runSnsBatch(entries, (_entry, id) => id);

    // Then each result is reported under its own entry id.
    assertArrayEquals(outcome.successful, ["one", "two"]);
    assertArrayEquals(outcome.failed, []);
  });

  it("reports an SNS failure as one entry's own", () => {
    // Given one entry whose work fails the way SNS fails.
    const entries = requireSnsBatchEntries([{ Id: "one" }]);

    // When it is run.
    const outcome = runSnsBatch(entries, () => {
      throw new SimSnsInvalidParameterValueException("no good");
    });

    // Then the failure belongs to the entry rather than the request.
    assertIdentical(
      outcome.failed.at(0)?.Code,
      "InvalidParameterValueException",
    );
    assertIdentical(outcome.failed.at(0)?.Message, "no good");
  });

  it("lets a failure that is not an SNS failure take the request down", () => {
    // Given one entry whose work fails for a reason that is not about the
    // entry, as an IAM denial would.
    const entries = requireSnsBatchEntries([{ Id: "one" }]);

    // When it is run.
    const error = assertThrowsError(() => {
      runSnsBatch(entries, () => {
        throw new Error("not authorized to perform sns:Publish");
      });
    });

    // Then it is not reported as an entry failure: the whole request fails.
    assertInstanceOf(error, Error);
    assertIdentical(error.message, "not authorized to perform sns:Publish");
  });
});
