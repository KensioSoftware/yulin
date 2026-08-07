import { assertIdentical, assertUndefined } from "@kensio/smartass";
import { describe, it } from "vitest";
import { parseSnsTopicArn } from "./sim-sns-topic-arn.js";

describe("parseSnsTopicArn", () => {
  it("reads the Region, Account and name a topic ARN carries", () => {
    // Given a topic ARN.
    // When it is read.
    const parts = parseSnsTopicArn("arn:aws:sns:eu-west-2:111111111111:orders");

    // Then all three facts come back, since all three decide what it reaches.
    assertIdentical(parts?.regionName, "eu-west-2");
    assertIdentical(parts.accountId, "111111111111");
    assertIdentical(parts.name, "orders");
  });

  it("reads nothing from a string that is not a topic ARN", () => {
    // Given strings that are shaped like a topic ARN and are not one.
    for (const value of [
      "arn:aws:sqs:eu-west-2:111111111111:orders",
      "arn:aws-cn:sns:eu-west-2:111111111111:orders",
      "orders",
      "arn:aws:sns:eu-west-2:111111111111:orders:5b6d8e1a",
      "arn:aws:sns::111111111111:orders",
      "arn:aws:sns:eu-west-2::orders",
      "arn:aws:sns:eu-west-2:111111111111:",
    ]) {
      // When each is read.
      // Then nothing comes back, rather than a topic being reached by a
      // partly-filled ARN.
      assertUndefined(parseSnsTopicArn(value));
    }
  });
});
