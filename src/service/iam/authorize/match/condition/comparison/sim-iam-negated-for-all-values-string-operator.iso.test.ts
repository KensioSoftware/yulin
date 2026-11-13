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

describe("sim IAM ForAllValues negated condition operators", () => {
  it("matches when every request value differs from every policy value", () => {
    // Given a grant withheld from two tag keys
    // When the request supplies neither of them
    const decision = decide(
      {
        "ForAllValues:StringNotEquals": {
          "aws:TagKeys": ["classification", "owner"],
        },
      },
      { "aws:TagKeys": ["environment", "cost-centre"] },
    );

    // Then the condition matches
    assertTrue(decision.isAllowed);
  });

  it("does not match when one request value equals a policy value", () => {
    // Given the same grant
    // When one of the tag keys the request supplies is one the policy names
    const decision = decide(
      {
        "ForAllValues:StringNotEquals": {
          "aws:TagKeys": ["classification", "owner"],
        },
      },
      { "aws:TagKeys": ["environment", "owner"] },
    );

    // Then the single match is enough to fail the condition
    assertTrue(decision.isImplicitDeny);
  });

  it("matches a request supplying the key with no values", () => {
    // Given the same grant
    // When the request supplies the tag-key context with nothing in it
    const decision = decide(
      {
        "ForAllValues:StringNotEquals": {
          "aws:TagKeys": ["classification", "owner"],
        },
      },
      { "aws:TagKeys": [] },
    );

    // Then there is no value to contradict the condition
    assertTrue(decision.isAllowed);
  });

  it("matches a request carrying no value for the key", () => {
    // Given the same grant
    // When the request supplies no tag-key context at all
    const decision = decide({
      "ForAllValues:StringNotEquals": {
        "aws:TagKeys": ["classification", "owner"],
      },
    });

    // Then the negated operator matches an absent key, as AWS documents
    assertTrue(decision.isAllowed);
  });

  it("matches when every request value falls outside the policy pattern", () => {
    // Given a grant withheld from the application namespace
    // When every tag key the request supplies is outside it
    const decision = decide(
      { "ForAllValues:StringNotLike": { "aws:TagKeys": "application:*" } },
      { "aws:TagKeys": ["owner", "environment"] },
    );

    // Then the condition matches
    assertTrue(decision.isAllowed);
  });

  it("does not match when one request value falls inside the policy pattern", () => {
    // Given the same grant
    // When one tag key the request supplies is in the namespace
    const decision = decide(
      { "ForAllValues:StringNotLike": { "aws:TagKeys": "application:*" } },
      { "aws:TagKeys": ["owner", "application:name"] },
    );

    // Then the wildcard covers it, so the condition does not match
    assertTrue(decision.isImplicitDeny);
  });
});
