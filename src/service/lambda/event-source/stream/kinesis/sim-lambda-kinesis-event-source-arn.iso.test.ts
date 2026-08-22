import {
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimLambdaInvalidParameterValueException } from "../../../error/sim-lambda.error.js";
import { SimLambdaKinesisEventSourceArn } from "./sim-lambda-kinesis-event-source-arn.js";

const streamArn = "arn:aws:kinesis:eu-west-2:111111111111:stream/orders";

describe("a Kinesis stream event source ARN", () => {
  it("reads the Region, the Account and the stream out of one", () => {
    // When a stream ARN is read.
    const parsed = SimLambdaKinesisEventSourceArn.of(streamArn);

    // Then everything a poller needs comes out of it.
    assertIdentical(parsed.kind, "kinesis-stream");
    assertIdentical(parsed.regionName, "eu-west-2");
    assertIdentical(parsed.accountId, "111111111111");
    assertIdentical(parsed.streamName, "orders");
    assertTrue(parsed.isIn("111111111111", "eu-west-2"));
    assertFalse(parsed.isIn("222222222222", "eu-west-2"));
  });

  it("asks for the three operations a poller performs, and ListStreams", () => {
    // When a stream ARN is read.
    const parsed = SimLambdaKinesisEventSourceArn.of(streamArn);

    // Then the execution role is checked for the operations AWS's own managed
    // policy grants, with ListStreams on every stream rather than on one.
    assertIdentical(
      parsed.pollingPermissions
        .map((permission) => `${permission.action} ${permission.resource}`)
        .join(", "),
      [
        `kinesis:DescribeStream ${streamArn}`,
        `kinesis:GetRecords ${streamArn}`,
        `kinesis:GetShardIterator ${streamArn}`,
        "kinesis:ListStreams *",
      ].join(", "),
    );
  });

  it("reads nothing out of a string that names something else", () => {
    // Given ARNs that name no Kinesis stream, including a consumer of one.
    const notStreamArns = [
      "orders",
      "arn:aws:kinesis:eu-west-2:111111111111:orders",
      "arn:aws:dynamodb:eu-west-2:111111111111:table/orders/stream/2026",
      `${streamArn}/consumer/projector:1756000000`,
    ];

    // When each is read.
    // Then nothing comes back, so the dispatcher can try the next parser.
    for (const value of notStreamArns) {
      assertUndefined(SimLambdaKinesisEventSourceArn.parse(value));
    }
  });

  it("refuses a string that is not a stream ARN, saying what one looks like", () => {
    // When something that is not a stream ARN is required to be one.
    const error = assertThrowsError(() => {
      SimLambdaKinesisEventSourceArn.of("orders");
    });

    // Then the refusal says the shape it wanted.
    assertInstanceOf(error, SimLambdaInvalidParameterValueException);
    assertStringIncludes(error.message, "is not a Kinesis stream ARN");
    assertStringIncludes(error.message, "stream/<stream-name>");
  });
});
