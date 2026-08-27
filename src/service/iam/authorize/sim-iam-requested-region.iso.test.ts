import { assertFalse, assertIdentical, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { makeSimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { SimIamPolicyDocument } from "../policy/sim-iam-policy.js";
import { SimIamPolicyDecisionValue } from "./sim-iam-decision.js";

/**
 * A resource policy denying the caller anything asked for in one Region.
 */
function denyInRegion(
  accountId: string,
  regionName: string,
): SimIamPolicyDocument {
  return {
    Version: "2012-10-17",
    Statement: {
      Sid: "DenyOutsideLondon",
      Effect: "Deny",
      Principal: `arn:aws:iam::${accountId}:root`,
      Action: "s3:GetObject",
      Resource: "*",
      Condition: { StringEquals: { "aws:RequestedRegion": regionName } },
    },
  };
}

describe("Sim IAM requested Region condition key", () => {
  it("derives the key from the Region the request was made in", () => {
    // Given an Account whose Bucket policy denies reads made in us-east-1.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });

    // When a read is made there.
    const decision = simAws
      .account(accountId)
      .iam()
      .authorize({
        action: "s3:GetObject",
        resource: `arn:aws:s3:::${accountId}-reports/summary.csv`,
        region: "us-east-1",
        resourcePolicies: [{ document: denyInRegion(accountId, "us-east-1") }],
      });

    // Then the condition matched the Region the request carried.
    assertIdentical(decision.value, SimIamPolicyDecisionValue.ExplicitDeny);
  });

  it("leaves a request made in another Region alone", () => {
    // Given the same policy, denying reads made in us-east-1.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });

    // When the read is made in eu-west-2 instead.
    const decision = simAws
      .account(accountId)
      .iam()
      .authorize({
        action: "s3:GetObject",
        resource: `arn:aws:s3:::${accountId}-reports/summary.csv`,
        region: "eu-west-2",
        resourcePolicies: [{ document: denyInRegion(accountId, "us-east-1") }],
      });

    // Then the condition matched nothing and the root principal is allowed.
    assertTrue(decision.isAllowed);
  });

  it("keeps the derived value when the service supplies its own", () => {
    // Given a request made in us-east-1 that says it was made somewhere else.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });

    // When it is authorized.
    const decision = simAws
      .account(accountId)
      .iam()
      .authorize({
        action: "s3:GetObject",
        resource: `arn:aws:s3:::${accountId}-reports/summary.csv`,
        region: "us-east-1",
        conditionContext: { "aws:RequestedRegion": "eu-west-2" },
        resourcePolicies: [{ document: denyInRegion(accountId, "us-east-1") }],
      });

    // Then IAM's own value is the one the condition is matched against, as it
    // is for every other key IAM derives.
    assertIdentical(decision.value, SimIamPolicyDecisionValue.ExplicitDeny);
  });

  it("supplies no value for a request naming no Region", () => {
    // Given a request made straight to IAM, which is Account-scoped and has no
    // Region of its own to name.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });

    // When it is authorized.
    const decision = simAws
      .account(accountId)
      .iam()
      .authorize({
        action: "s3:GetObject",
        resource: `arn:aws:s3:::${accountId}-reports/summary.csv`,
        resourcePolicies: [{ document: denyInRegion(accountId, "us-east-1") }],
      });

    // Then the key is missing rather than guessed at, and the statement
    // conditioned on it matches nothing.
    assertTrue(decision.isAllowed);
    assertFalse(decision.isDenied);
  });
});
