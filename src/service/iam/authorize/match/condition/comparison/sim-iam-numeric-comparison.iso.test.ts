import { assertFalse, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimIam } from "../../../../sim-iam.js";
import { simIamAuthZResourcePolicySourceFactory } from "../../../context/sim-iam-auth-z-context.factory.js";
import type {
  SimIamConditionValue,
  SimIamPolicyDocumentCondition,
} from "../../../../policy/sim-iam-policy.js";

const reportsBucket = "arn:aws:s3:::reports-bucket";

/**
 * Whether a resource policy allowing a listing on one condition allows it,
 * with the request context supplied alongside.
 */
function allowed(
  condition: SimIamPolicyDocumentCondition,
  conditionContext: Readonly<Record<string, SimIamConditionValue>> = {},
): boolean {
  return new SimIam().authorize({
    action: "s3:ListBucket",
    resource: reportsBucket,
    caller: { kind: "anonymous" },
    conditionContext,
    resourcePolicies: [
      simIamAuthZResourcePolicySourceFactory.make({
        document: {
          Statement: {
            Effect: "Allow",
            Principal: "*",
            Action: "s3:ListBucket",
            Resource: reportsBucket,
            Condition: condition,
          },
        },
      }),
    ],
  }).isAllowed;
}

describe("sim IAM numeric condition operators", () => {
  it("matches NumericLessThanEquals at the policy limit", () => {
    // Given a listing allowed up to ten keys at a time
    // When the request asks for exactly ten
    const isAllowed = allowed(
      { NumericLessThanEquals: { "s3:max-keys": "10" } },
      { "s3:max-keys": 10 },
    );

    // Then the boundary value is inside the limit
    assertTrue(isAllowed);
  });

  it("compares numeric strings by value", () => {
    // Given a limit written as text
    // When a smaller value also arrives as text with more digits in the limit
    const isAllowed = allowed(
      { NumericLessThanEquals: { "s3:max-keys": "10" } },
      { "s3:max-keys": "2" },
    );

    // Then the two are compared as numbers
    assertTrue(isAllowed);
  });

  it("matches NumericLessThan below the limit only", () => {
    // Given a listing allowed for fewer than ten keys
    // When the request asks for nine and then for ten
    const condition = { NumericLessThan: { "s3:max-keys": "10" } };

    // Then nine is allowed and ten is not
    assertTrue(allowed(condition, { "s3:max-keys": 9 }));
    assertFalse(allowed(condition, { "s3:max-keys": 10 }));
  });

  it("matches NumericGreaterThan and NumericGreaterThanEquals from the limit", () => {
    // Given listings allowed above and from a floor of five keys
    const above = { NumericGreaterThan: { "s3:max-keys": "5" } };
    const from = { NumericGreaterThanEquals: { "s3:max-keys": "5" } };

    // When the request asks for exactly five
    // Then only the inclusive operator allows it
    assertFalse(allowed(above, { "s3:max-keys": 5 }));
    assertTrue(allowed(from, { "s3:max-keys": 5 }));
  });

  it("matches NumericEquals against any of several policy values", () => {
    // Given a listing allowed for page sizes of 10 or 100
    // When the request asks for 100
    const isAllowed = allowed(
      { NumericEquals: { "s3:max-keys": ["10", "100"] } },
      { "s3:max-keys": "100" },
    );

    // Then one policy value equal to it is enough
    assertTrue(isAllowed);
  });

  it("requires NumericNotEquals to differ from every policy value", () => {
    // Given a listing withheld from page sizes of 10 and 100
    const condition = { NumericNotEquals: { "s3:max-keys": ["10", "100"] } };

    // When the request asks for 100, and then for 50
    // Then the first equals a withheld value and the second differs from both
    assertFalse(allowed(condition, { "s3:max-keys": 100 }));
    assertTrue(allowed(condition, { "s3:max-keys": 50 }));
  });

  it("refuses a request value that is not a number", () => {
    // Given a numeric limit
    // When the request value is empty text
    const isAllowed = allowed(
      { NumericLessThanEquals: { "s3:max-keys": "10" } },
      { "s3:max-keys": "" },
    );

    // Then the value is refused rather than coerced to zero
    assertFalse(isAllowed);
  });

  it("refuses a negated comparison it cannot read", () => {
    // Given a listing withheld from a page size written as a word
    // When any page size is asked for
    const isAllowed = allowed(
      { NumericNotEquals: { "s3:max-keys": "ten" } },
      { "s3:max-keys": 50 },
    );

    // Then the condition fails rather than reading the word as a difference
    assertFalse(isAllowed);
  });

  it("matches nothing when the request carries no value for the key", () => {
    // Given a numeric limit
    // When the request supplies no page size at all
    const isAllowed = allowed({
      NumericLessThanEquals: { "s3:max-keys": "10" },
    });

    // Then there is no value to compare
    assertFalse(isAllowed);
  });
});
