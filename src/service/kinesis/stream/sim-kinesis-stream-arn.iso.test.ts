import { assertIdentical, assertUndefined } from "@kensio/smartass";
import { assertDefined } from "../../../util/type-guard/defined.js";
import { describe, it } from "vitest";
import {
  parseSimKinesisStreamArn,
  simKinesisStreamArn,
} from "./sim-kinesis-stream-arn.js";

const scope = {
  accountId: "111111111111",
  regionName: "eu-west-2",
} as Parameters<typeof simKinesisStreamArn>[0];

describe("A simulated Kinesis stream ARN", () => {
  it("names the region, the account and the stream", () => {
    // When an ARN is built for a stream in a scope.
    const arn = simKinesisStreamArn(scope, "orders");

    // Then it carries all three, with the resource type real Kinesis uses.
    assertIdentical(
      arn,
      "arn:aws:kinesis:eu-west-2:111111111111:stream/orders",
    );
  });

  it("reads the region, the account and the stream back out", () => {
    // When a stream ARN is read.
    const location = parseSimKinesisStreamArn(
      "arn:aws:kinesis:eu-west-2:111111111111:stream/orders",
    );

    // Then all three come back.
    assertDefined(location, "parsed Kinesis stream ARN");
    assertIdentical(location.regionName, "eu-west-2");
    assertIdentical(location.accountId, "111111111111");
    assertIdentical(location.name, "orders");
  });

  it("reads nothing out of a string that is not a stream ARN", () => {
    // Given strings that name no Kinesis stream, including a consumer ARN and
    // an ARN of another service.
    const notStreamArns = [
      "orders",
      "arn:aws:kinesis:eu-west-2:111111111111:orders",
      "arn:aws:sqs:eu-west-2:111111111111:orders",
      "arn:aws-cn:kinesis:eu-west-2:111111111111:stream/orders",
      "arn:aws:kinesis::111111111111:stream/orders",
      "arn:aws:kinesis:eu-west-2::stream/orders",
      "arn:aws:kinesis:eu-west-2:111111111111:stream/",
      "arn:aws:kinesis:eu-west-2:111111111111:stream/orders/consumer/live:1",
    ];

    // When each is read.
    // Then nothing comes back, rather than a partly read location.
    for (const value of notStreamArns) {
      assertUndefined(parseSimKinesisStreamArn(value));
    }
  });
});
