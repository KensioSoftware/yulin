import { assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimIam } from "../../../../sim-iam.js";
import { simIamAuthZResourcePolicySourceFactory } from "../../../context/sim-iam-auth-z-context.factory.js";
import type {
  SimIamConditionValue,
  SimIamPolicyDocumentCondition,
} from "../../../../policy/sim-iam-policy.js";
import type { SimIamPolicyDecision } from "../../../sim-iam-decision.js";

const orderItems = "arn:aws:dynamodb:us-east-1:123456789012:table/Orders";

/**
 * Authorize a write against a resource policy allowing it on one condition,
 * with the request context supplied alongside.
 */
function decide(
  condition: SimIamPolicyDocumentCondition,
  conditionContext: Readonly<Record<string, SimIamConditionValue>> = {},
): SimIamPolicyDecision {
  const simIam = new SimIam();

  return simIam.authorize({
    action: "dynamodb:UpdateItem",
    resource: orderItems,
    caller: { kind: "anonymous" },
    conditionContext,
    resourcePolicies: [
      simIamAuthZResourcePolicySourceFactory.make({
        document: {
          Statement: {
            Effect: "Allow",
            Principal: "*",
            Action: "dynamodb:UpdateItem",
            Resource: orderItems,
            Condition: condition,
          },
        },
      }),
    ],
  });
}

describe("sim IAM Null condition operator", () => {
  it("matches a false check when the request carries the key", () => {
    // Given a grant requiring the request to name a partition key
    // When it names one
    const decision = decide(
      { Null: { "dynamodb:LeadingKeys": "false" } },
      { "dynamodb:LeadingKeys": ["ORDER#1"] },
    );

    // Then the key exists, so the condition matches
    assertTrue(decision.isAllowed);
  });

  it("refuses a false check when the request carries no value for the key", () => {
    // Given the same grant
    // When the request names no partition key at all
    const decision = decide({ Null: { "dynamodb:LeadingKeys": "false" } });

    // Then the key is absent and the statement does not match
    assertTrue(decision.isImplicitDeny);
  });

  it("matches a true check when the request carries no value for the key", () => {
    // Given a grant reserved for requests naming no partition key
    // When the request names none
    const decision = decide({ Null: { "dynamodb:LeadingKeys": "true" } });

    // Then the condition matches
    assertTrue(decision.isAllowed);
  });

  it("refuses a true check when the request carries the key", () => {
    // Given the same grant
    // When the request names a partition key
    const decision = decide(
      { Null: { "dynamodb:LeadingKeys": "true" } },
      { "dynamodb:LeadingKeys": ["ORDER#1"] },
    );

    // Then the key exists and the statement does not match
    assertTrue(decision.isImplicitDeny);
  });

  it("guards a ForAllValues Allow against a request carrying no value", () => {
    // Given the guarded form AWS recommends, which is a ForAllValues condition
    // beside a Null check, on a request reaching no partition key value
    const decision = decide({
      "ForAllValues:StringLike": { "dynamodb:LeadingKeys": ["ORDER#*"] },
      Null: { "dynamodb:LeadingKeys": "false" },
    });

    // Then the guard refuses what ForAllValues would have matched vacuously
    assertTrue(decision.isImplicitDeny);
  });

  it("leaves a guarded ForAllValues Allow standing for a matching request", () => {
    // Given the same guarded grant
    // When the request reaches a partition key the pattern covers
    const decision = decide(
      {
        "ForAllValues:StringLike": { "dynamodb:LeadingKeys": ["ORDER#*"] },
        Null: { "dynamodb:LeadingKeys": "false" },
      },
      { "dynamodb:LeadingKeys": ["ORDER#1", "ORDER#2"] },
    );

    // Then both operators match and the grant stands
    assertTrue(decision.isAllowed);
  });

  it("reads a JSON boolean policy value the way it reads the string", () => {
    // Given a grant whose Null check is written as a boolean rather than the
    // quoted form AWS documents
    // When the request carries the key
    const decision = decide(
      { Null: { "dynamodb:LeadingKeys": false } },
      { "dynamodb:LeadingKeys": ["ORDER#1"] },
    );

    // Then it means what the string means
    assertTrue(decision.isAllowed);
  });

  it("treats a key carrying no values as absent", () => {
    // Given a grant requiring the request to name a partition key
    // When the request carries the key with an empty list of values, which AWS
    // calls a null dataset
    const decision = decide(
      { Null: { "dynamodb:LeadingKeys": "false" } },
      { "dynamodb:LeadingKeys": [] },
    );

    // Then the value is null and the statement does not match
    assertTrue(decision.isImplicitDeny);
  });

  it("treats an empty string as absent", () => {
    // Given the same grant
    // When the request carries the key with an empty string, the example AWS
    // gives of a null dataset
    const decision = decide(
      { Null: { "dynamodb:LeadingKeys": "false" } },
      { "dynamodb:LeadingKeys": "" },
    );

    // Then the value is null and the statement does not match
    assertTrue(decision.isImplicitDeny);
  });

  it("matches nothing where the policy value is neither true nor false", () => {
    // Given a Null check written with a value it has no meaning for
    // When the request carries the key
    const decision = decide(
      { Null: { "dynamodb:LeadingKeys": "yes" } },
      { "dynamodb:LeadingKeys": ["ORDER#1"] },
    );

    // Then the operator answers neither way and the statement is skipped
    assertTrue(decision.isImplicitDeny);
  });

  it("matches nothing where an absent key meets a policy value it cannot read", () => {
    // Given the same unreadable check
    // When the request carries no value for the key
    const decision = decide({ Null: { "dynamodb:LeadingKeys": "yes" } });

    // Then it fails closed the same way
    assertTrue(decision.isImplicitDeny);
  });
});
