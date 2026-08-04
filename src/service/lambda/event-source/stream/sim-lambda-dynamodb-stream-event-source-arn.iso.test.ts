import {
  assertArrayEquals,
  assertIdentical,
  assertStringIncludes,
  assertThrowsError,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimLambdaDynamoDbStreamEventSourceArn } from "./sim-lambda-dynamodb-stream-event-source-arn.js";

const streamArn =
  "arn:aws:dynamodb:eu-west-2:111111111111:table/orders/stream/2026-08-04T09:00:00.000";

describe("sim Lambda DynamoDB stream event source ARNs", () => {
  it("reads the stream a mapping polls out of its ARN", () => {
    // Given a stream ARN, whose label carries two colons of its own.
    // When it is read.
    const eventSourceArn = SimLambdaDynamoDbStreamEventSourceArn.of(streamArn);

    // Then the table and the label come out whole, rather than the label being
    // cut up by a naive split on colons.
    assertIdentical(eventSourceArn.kind, "dynamodb-stream");
    assertIdentical(eventSourceArn.serviceLabel, "DynamoDB Streams");
    assertIdentical(eventSourceArn.regionName, "eu-west-2");
    assertIdentical(eventSourceArn.accountId, "111111111111");
    assertIdentical(eventSourceArn.tableName, "orders");
    assertIdentical(eventSourceArn.label, "2026-08-04T09:00:00.000");
  });

  it("names the operations a poller has to be allowed to call", () => {
    // Given a stream ARN.
    // When its polling permissions are read.
    const permissions =
      SimLambdaDynamoDbStreamEventSourceArn.of(streamArn).pollingPermissions;

    // Then they are the three operations a poller performs on the stream, plus
    // listing streams, which is on every stream rather than on one.
    assertArrayEquals(
      permissions.map((permission) => permission.action),
      [
        "dynamodb:DescribeStream",
        "dynamodb:GetRecords",
        "dynamodb:GetShardIterator",
        "dynamodb:ListStreams",
      ],
    );
    assertArrayEquals(
      permissions.map((permission) => permission.resource),
      [streamArn, streamArn, streamArn, "*"],
    );
  });

  it("delivers a hundred records at a time when a mapping asks for no size", () => {
    // Given a stream ARN.
    // When its batch rules are read.
    const { batchRules } = SimLambdaDynamoDbStreamEventSourceArn.of(streamArn);

    // Then they are the ones real Lambda and CDK both use for a stream.
    assertIdentical(batchRules.sizeIn(undefined), 100);
    assertIdentical(batchRules.maximumSize, 10_000);
  });

  it("refuses a batch size a stream would never deliver", () => {
    // Given a stream ARN.
    const { batchRules } = SimLambdaDynamoDbStreamEventSourceArn.of(streamArn);

    // When a mapping asks for more than a stream hands out.
    const error = assertThrowsError(() => batchRules.sizeIn(10_001));

    // Then the refusal says what a stream does deliver.
    assertStringIncludes(error.message, "a DynamoDB stream delivers");
    assertStringIncludes(error.message, "between 1 and 10000");
  });

  it("is not read from an ARN naming something else", () => {
    // Given ARNs that are not a DynamoDB stream ARN.
    // When each is read.
    // Then nothing comes back, so the ARN dispatcher can try the next kind.
    assertUndefined(
      SimLambdaDynamoDbStreamEventSourceArn.parse(
        "arn:aws:dynamodb:eu-west-2:111111111111:table/orders",
      ),
    );
    assertUndefined(
      SimLambdaDynamoDbStreamEventSourceArn.parse(
        "arn:aws:sqs:eu-west-2:111111111111:orders",
      ),
    );
  });

  it("refuses an ARN that is not a stream ARN at all", () => {
    // Given something that is not an ARN.
    // When it is read as a stream ARN.
    const error = assertThrowsError(() =>
      SimLambdaDynamoDbStreamEventSourceArn.of("orders"),
    );

    // Then the refusal says how a stream ARN is written.
    assertStringIncludes(error.message, "is not a DynamoDB stream ARN");
    assertStringIncludes(error.message, "table/<table-name>/stream/<label>");
  });
});
