import { assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimIam } from "../../../../sim-iam.js";
import { simIamAuthZResourcePolicySourceFactory } from "../../../context/sim-iam-auth-z-context.factory.js";
import type {
  SimIamConditionValue,
  SimIamPolicyDocumentCondition,
} from "../../../../policy/sim-iam-policy.js";
import type { SimIamPolicyDecision } from "../../../sim-iam-decision.js";

const reportObject = "arn:aws:s3:::reports-bucket/summary.csv";

/**
 * Authorize a tagging request against a resource policy allowing it on one
 * condition, with the request context supplied alongside.
 */
function decide(
  condition: SimIamPolicyDocumentCondition,
  conditionContext: Readonly<Record<string, SimIamConditionValue>> = {},
): SimIamPolicyDecision {
  const simIam = new SimIam();

  return simIam.authorize({
    action: "s3:PutObjectTagging",
    resource: reportObject,
    caller: { kind: "anonymous" },
    conditionContext,
    resourcePolicies: [
      simIamAuthZResourcePolicySourceFactory.make({
        document: {
          Statement: {
            Effect: "Allow",
            Principal: "*",
            Action: "s3:PutObjectTagging",
            Resource: reportObject,
            Condition: condition,
          },
        },
      }),
    ],
  });
}

describe("sim IAM ForAnyValue negated condition operators", () => {
  it("matches when one request value differs from every policy value", () => {
    // Given a grant asking for a tag key outside the two it names
    // When the request supplies one of those two and one other
    const decision = decide(
      {
        "ForAnyValue:StringNotEquals": {
          "aws:TagKeys": ["classification", "owner"],
        },
      },
      { "aws:TagKeys": ["owner", "environment"] },
    );

    // Then the one value differing from both policy values is enough
    assertTrue(decision.isAllowed);
  });

  it("does not match when every request value equals a policy value", () => {
    // Given the same grant
    // When every tag key the request supplies is one the policy names
    const decision = decide(
      {
        "ForAnyValue:StringNotEquals": {
          "aws:TagKeys": ["classification", "owner"],
        },
      },
      { "aws:TagKeys": ["owner", "classification"] },
    );

    // Then no value is left to differ from them
    assertTrue(decision.isImplicitDeny);
  });

  it("does not match a request supplying the key with no values", () => {
    // Given the same grant
    // When the request supplies the tag-key context with nothing in it
    const decision = decide(
      {
        "ForAnyValue:StringNotEquals": {
          "aws:TagKeys": ["classification", "owner"],
        },
      },
      { "aws:TagKeys": [] },
    );

    // Then there is no value that could satisfy the condition
    assertTrue(decision.isImplicitDeny);
  });

  it("does not match a request carrying no value for the key", () => {
    // Given the same grant
    // When the request supplies no tag-key context at all
    const decision = decide({
      "ForAnyValue:StringNotEquals": {
        "aws:TagKeys": ["classification", "owner"],
      },
    });

    // Then `ForAnyValue` answers false for an absent key whatever it wraps,
    // as AWS documents, leaving the negation nothing to apply to
    assertTrue(decision.isImplicitDeny);
  });

  it("matches when one request value falls outside every policy pattern", () => {
    // Given a grant asking for a tag key outside the application namespace
    // When the request supplies one inside it and one outside
    const decision = decide(
      { "ForAnyValue:StringNotLike": { "aws:TagKeys": "application:*" } },
      { "aws:TagKeys": ["application:name", "owner"] },
    );

    // Then the value the pattern does not cover is enough
    assertTrue(decision.isAllowed);
  });

  it("does not match when every request value falls inside a policy pattern", () => {
    // Given the same grant
    // When every tag key the request supplies is in the namespace
    const decision = decide(
      { "ForAnyValue:StringNotLike": { "aws:TagKeys": "application:*" } },
      { "aws:TagKeys": ["application:name", "application:owner"] },
    );

    // Then the wildcard covers them all, so the condition does not match
    assertTrue(decision.isImplicitDeny);
  });
});
