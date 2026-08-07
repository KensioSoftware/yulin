import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimSnsInvalidParameterException } from "../error/sim-sns.error.js";
import { SimSnsTopicPolicy } from "./sim-sns-topic-policy.js";

const validDocument = JSON.stringify({
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { AWS: "arn:aws:iam::222222222222:root" },
      Action: "SNS:Publish",
      Resource: "arn:aws:sns:us-east-1:888888888888:orders",
    },
  ],
});

describe("SimSnsTopicPolicy", () => {
  it("keeps the string a policy was set with", () => {
    // Given a policy document with whitespace of its own.
    const spaced = JSON.stringify(JSON.parse(validDocument), undefined, 2);

    // When it is read as a topic policy.
    const policy = SimSnsTopicPolicy.parse(spaced);

    // Then the string is kept, so it can be reported back unchanged.
    assertIdentical(policy.value, spaced);
  });

  it("refuses a document that is not JSON", () => {
    // Given a value that is not a policy document at all.
    // When it is read as a topic policy.
    const error = assertThrowsError(() => {
      SimSnsTopicPolicy.parse("not a policy");
    });

    // Then it is refused when it is set, rather than when it is evaluated.
    assertInstanceOf(error, SimSnsInvalidParameterException);
  });

  it("refuses a statement IAM would refuse", () => {
    // Given a statement with no Effect.
    const document = JSON.stringify({
      Version: "2012-10-17",
      Statement: [{ Action: "SNS:Publish", Resource: "*" }],
    });

    // When it is read as a topic policy.
    const error = assertThrowsError(() => {
      SimSnsTopicPolicy.parse(document);
    });

    // Then sim IAM's own policy document rules refuse it.
    assertInstanceOf(error, SimSnsInvalidParameterException);
  });
});
