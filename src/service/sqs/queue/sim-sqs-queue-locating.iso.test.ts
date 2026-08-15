import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { sqsQueueArnOf, sqsQueueUrlOf } from "./sim-sqs-queue-arn.js";

const queueArn = "arn:aws:sqs:eu-west-2:111111111111:orders";
const queueUrl = "https://sqs.eu-west-2.amazonaws.com/111111111111/orders";

describe("Naming a simulated queue by ARN and by URL", () => {
  it("reads each format from the other", () => {
    // Given the ARN and the URL of one queue.
    // When each is read as the other.
    // Then both carry the same Region, Account and name.
    assertIdentical(sqsQueueUrlOf(queueArn), queueUrl);
    assertIdentical(sqsQueueArnOf(queueUrl), queueArn);
  });

  it("refuses a value that is not a queue ARN", () => {
    // Given something that is not a queue ARN.
    // When it is read as one.
    const error = assertThrowsError(() => {
      sqsQueueUrlOf("arn:aws:sqs:eu-west-2:111111111111:orders/deadletter");
    });

    // Then it says how a queue ARN is written.
    assertStringIncludes(
      error.message,
      "arn:aws:sqs:<region>:<account-id>:<queue-name>",
    );
  });

  it("refuses a value that is not a queue URL", () => {
    // Given something that is not a queue URL.
    // When it is read as one.
    const error = assertThrowsError(() => {
      sqsQueueArnOf("orders");
    });

    // Then it says how a queue URL is written.
    assertStringIncludes(error.message, "https://sqs.<region>.amazonaws.com");
  });
});
