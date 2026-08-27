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
 * Authorize a read against a resource policy allowing it on one condition,
 * with the request context supplied alongside.
 */
function decide(
  condition: SimIamPolicyDocumentCondition,
  conditionContext: Readonly<Record<string, SimIamConditionValue>> = {},
): SimIamPolicyDecision {
  const simIam = new SimIam();

  return simIam.authorize({
    action: "s3:GetObject",
    resource: reportObject,
    caller: { kind: "anonymous" },
    conditionContext,
    resourcePolicies: [
      simIamAuthZResourcePolicySourceFactory.make({
        document: {
          Statement: {
            Effect: "Allow",
            Principal: "*",
            Action: "s3:GetObject",
            Resource: reportObject,
            Condition: condition,
          },
        },
      }),
    ],
  });
}

describe("sim IAM negated scalar condition operators", () => {
  it("matches a StringNotEquals value differing from the policy value", () => {
    // Given a grant withheld from one classification
    // When the request carries another one
    const decision = decide(
      { StringNotEquals: { "s3:ExistingObjectTag/classification": "secret" } },
      { "s3:ExistingObjectTag/classification": "public" },
    );

    // Then the condition matches and the grant stands
    assertTrue(decision.isAllowed);
  });

  it("does not match a StringNotEquals value equal to the policy value", () => {
    // Given the same grant
    // When the request carries the classification it is withheld from
    const decision = decide(
      { StringNotEquals: { "s3:ExistingObjectTag/classification": "secret" } },
      { "s3:ExistingObjectTag/classification": "secret" },
    );

    // Then the statement does not match
    assertTrue(decision.isImplicitDeny);
  });

  it("requires a StringNotEquals value to differ from every policy value", () => {
    // Given a grant withheld from two classifications, which AWS reads as an
    // AND rather than the OR a positive operator makes of a list
    // When the request carries the second of them
    const decision = decide(
      {
        StringNotEquals: {
          "s3:ExistingObjectTag/classification": ["secret", "internal"],
        },
      },
      { "s3:ExistingObjectTag/classification": "internal" },
    );

    // Then one match is enough to fail the condition
    assertTrue(decision.isImplicitDeny);
  });

  it("matches a StringNotEquals value differing from all of several policy values", () => {
    // Given the same two-value grant
    // When the request carries neither of them
    const decision = decide(
      {
        StringNotEquals: {
          "s3:ExistingObjectTag/classification": ["secret", "internal"],
        },
      },
      { "s3:ExistingObjectTag/classification": "public" },
    );

    // Then the condition matches
    assertTrue(decision.isAllowed);
  });

  it("matches a negated operator when the request carries no value for the key", () => {
    // Given a grant withheld from one classification
    // When the request supplies no classification at all
    const decision = decide({
      StringNotEquals: { "s3:ExistingObjectTag/classification": "secret" },
    });

    // Then the condition matches, as AWS documents: with no value in the
    // request there is none that could equal the policy value
    assertTrue(decision.isAllowed);
  });

  it("compares StringNotEquals values case-sensitively", () => {
    // Given a grant withheld from a lower-case classification
    // When the request carries the same word in a different case
    const decision = decide(
      { StringNotEquals: { "s3:ExistingObjectTag/classification": "secret" } },
      { "s3:ExistingObjectTag/classification": "Secret" },
    );

    // Then the two values differ, so the condition matches
    assertTrue(decision.isAllowed);
  });

  it("does not match a StringNotEquals request value that is not scalar", () => {
    // Given a grant using an unqualified operator, which needs a scalar
    // When the request supplies a multi-valued key instead
    const decision = decide(
      { StringNotEquals: { "aws:TagKeys": "classification" } },
      { "aws:TagKeys": ["owner", "environment"] },
    );

    // Then the operand is rejected rather than compared
    assertTrue(decision.isImplicitDeny);
  });

  it("does not match a StringNotEquals policy value that is not a string", () => {
    // Given a grant whose policy value is a number
    // When the request carries a string
    const decision = decide(
      { StringNotEquals: { "s3:ExistingObjectTag/version": 2 } },
      { "s3:ExistingObjectTag/version": "3" },
    );

    // Then the operand is rejected rather than coerced
    assertTrue(decision.isImplicitDeny);
  });

  it("matches a StringNotLike value no policy pattern covers", () => {
    // Given a grant withheld from the internal key prefix
    // When the request carries a key outside it
    const decision = decide(
      { StringNotLike: { "s3:prefix": "internal/*" } },
      { "s3:prefix": "public/summary.csv" },
    );

    // Then the condition matches
    assertTrue(decision.isAllowed);
  });

  it("does not match a StringNotLike value a policy pattern covers", () => {
    // Given the same grant
    // When the request carries a key inside the withheld prefix
    const decision = decide(
      { StringNotLike: { "s3:prefix": "internal/*" } },
      { "s3:prefix": "internal/payroll.csv" },
    );

    // Then the wildcard matches, so the condition does not
    assertTrue(decision.isImplicitDeny);
  });

  it("matches an ArnNotLike principal outside the policy pattern", () => {
    // Given a grant withheld from the landing zone roles
    // When an application role asks
    const decision = decide(
      {
        ArnNotLike: {
          "aws:PrincipalArn": "arn:aws:iam::*:role/LandingZone/*",
        },
      },
      { "aws:PrincipalArn": "arn:aws:iam::123456789012:role/OrdersService" },
    );

    // Then the condition matches
    assertTrue(decision.isAllowed);
  });

  it("does not match an ArnNotLike principal inside the policy pattern", () => {
    // Given the same grant
    // When a landing zone role asks
    const decision = decide(
      {
        ArnNotLike: {
          "aws:PrincipalArn": "arn:aws:iam::*:role/LandingZone/*",
        },
      },
      {
        "aws:PrincipalArn":
          "arn:aws:iam::123456789012:role/LandingZone/Deployment",
      },
    );

    // Then the pattern matches, so the condition does not
    assertTrue(decision.isImplicitDeny);
  });

  it("keeps an ArnNotEquals wildcard inside the component it is written in", () => {
    // Given a grant withheld from a pattern with fewer components than an ARN
    // has, which therefore matches no ARN at all
    // When any principal asks
    const decision = decide(
      { ArnNotEquals: { "aws:PrincipalArn": "arn:aws:iam:*" } },
      { "aws:PrincipalArn": "arn:aws:iam::123456789012:role/OrdersService" },
    );

    // Then nothing matched the pattern, so the negated condition matches
    assertTrue(decision.isAllowed);
  });

  it("does not match an ArnNotEquals principal the policy names", () => {
    // Given a grant withheld from one role
    // When that role asks
    const decision = decide(
      {
        ArnNotEquals: {
          "aws:PrincipalArn": "arn:aws:iam::123456789012:role/OrdersService",
        },
      },
      { "aws:PrincipalArn": "arn:aws:iam::123456789012:role/OrdersService" },
    );

    // Then the statement does not match
    assertTrue(decision.isImplicitDeny);
  });
});
