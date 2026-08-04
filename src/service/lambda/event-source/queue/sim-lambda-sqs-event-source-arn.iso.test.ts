import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsError,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimLambdaSqsEventSourceArn } from "./sim-lambda-sqs-event-source-arn.js";

describe("sim Lambda SQS event source ARNs", () => {
  it("reads the queue a mapping polls out of its ARN", () => {
    // Given a queue ARN.
    const queueArn = "arn:aws:sqs:eu-west-2:111111111111:orders";

    // When it is read.
    const eventSourceArn = SimLambdaSqsEventSourceArn.of(queueArn);

    // Then it knows what kind of source it is, and both halves of what a
    // poller needs come out of it.
    assertIdentical(eventSourceArn.kind, "sqs");
    assertIdentical(eventSourceArn.serviceLabel, "SQS");
    assertIdentical(eventSourceArn.regionName, "eu-west-2");
    assertIdentical(
      eventSourceArn.queueUrl,
      "https://sqs.eu-west-2.amazonaws.com/111111111111/orders",
    );
  });

  it("names the operations a poller has to be allowed to call", () => {
    // Given a queue ARN.
    const queueArn = "arn:aws:sqs:eu-west-2:111111111111:orders";

    // When its polling permissions are read.
    const permissions =
      SimLambdaSqsEventSourceArn.of(queueArn).pollingPermissions;

    // Then they are the three SQS operations real Lambda checks, on the queue,
    // each naming the operation the way a refusal reports it.
    assertIdentical(
      permissions.map((permission) => permission.action).join(","),
      "sqs:ReceiveMessage,sqs:DeleteMessage,sqs:GetQueueAttributes",
    );
    assertIdentical(
      permissions.map((permission) => permission.operationName).join(","),
      "ReceiveMessage,DeleteMessage,GetQueueAttributes",
    );
    assertIdentical(
      permissions.map((permission) => permission.resource).join(","),
      [queueArn, queueArn, queueArn].join(","),
    );
  });

  it("answers with nothing for an ARN that is not a queue", () => {
    // Given an ARN naming something other than a queue.
    // When it is parsed.
    const parsed = SimLambdaSqsEventSourceArn.parse(
      "arn:aws:kinesis:eu-west-2:111111111111:stream/orders",
    );

    // Then the dispatcher is left to decide what to say about it.
    assertUndefined(parsed);
  });

  it("refuses an ARN that is not a queue when read directly", () => {
    // Given an ARN naming something other than a queue.
    // When it is read as a queue ARN.
    const error = assertThrowsError(() => {
      SimLambdaSqsEventSourceArn.of("arn:aws:sqs:eu-west-2:orders");
    });

    // Then it says what a queue ARN looks like.
    assertIdentical(error.name, "InvalidParameterValueException");
    assertStringIncludes(error.message, "is not an SQS queue ARN");
    assertStringIncludes(
      error.message,
      "arn:aws:sqs:<region>:<account-id>:<queue-name>",
    );
  });
});
