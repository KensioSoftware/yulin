import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";

const denyAfterFreeze = {
  Version: "2012-10-17",
  Statement: {
    Sid: "DenyBucketCreationAfterFreeze",
    Effect: "Deny",
    Action: "s3:CreateBucket",
    Resource: "*",
    Condition: {
      DateGreaterThan: { "aws:CurrentTime": "2026-01-01T00:00:00Z" },
    },
  },
} as const;

describe("Sim IAM statements it could not evaluate", () => {
  it("reports a service control policy statement holding an operator it cannot read", () => {
    // Given an organization denying Bucket creation past a date, under a
    // condition operator sim IAM has no implementation for.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });

    simAws
      .organizations()
      .attachServiceControlPolicy(accountId, denyAfterFreeze, {
        policyName: "BucketGuardrail",
      });

    // When the Account root asks to create a Bucket.
    const decision = simAws
      .account(accountId)
      .iam()
      .authorize({
        action: "s3:CreateBucket",
        resource: `arn:aws:s3:::${accountId}-reports`,
      });

    // Then the guardrail let it through, and the decision says which
    // statement went unread and what stopped it.
    assertTrue(decision.isAllowed);
    assertArrayLength(decision.unevaluatedStatements, 1);

    const [unevaluated] = decision.unevaluatedStatements;

    assertIdentical(unevaluated.policy, "BucketGuardrail");
    assertIdentical(unevaluated.sourceType, "service-control");
    assertIdentical(unevaluated.statement.Sid, "DenyBucketCreationAfterFreeze");
    assertIdentical(
      unevaluated.reason,
      "unsupported condition operator DateGreaterThan",
    );
  });

  it("counts one guardrail attached at two levels once", () => {
    // Given the same guardrail attached both to the organizational unit an
    // Account sits in and to the Account itself.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const organizations = simAws.organizations();
    const workloads = organizations.createOrganizationalUnit("Workloads");

    organizations.moveAccount(accountId, workloads);
    organizations.attachServiceControlPolicy(workloads, denyAfterFreeze, {
      policyName: "BucketGuardrail",
    });
    organizations.attachServiceControlPolicy(accountId, denyAfterFreeze, {
      policyName: "BucketGuardrail",
    });

    // When the Account root asks to create a Bucket.
    const decision = simAws
      .account(accountId)
      .iam()
      .authorize({
        action: "s3:CreateBucket",
        resource: `arn:aws:s3:::${accountId}-reports`,
      });

    // Then the statement going unread is reported once for the request,
    // however many levels reached it.
    assertArrayLength(decision.unevaluatedStatements, 1);
  });

  it("reports nothing for policies it read in full", () => {
    // Given a Bucket policy whose condition sim IAM supports.
    const simAws = new SimAws();

    // When a request satisfies it.
    const decision = simAws
      .account("123456789012")
      .iam()
      .authorize({
        action: "s3:GetObject",
        resource: "arn:aws:s3:::reports-bucket/summary.csv",
        caller: { kind: "anonymous" },
        conditionContext: { "aws:SourceVpce": "vpce-1a2b3c4d" },
        resourcePolicies: [
          {
            policyName: "ReportsBucketPolicy",
            document: {
              Version: "2012-10-17",
              Statement: {
                Effect: "Allow",
                Principal: "*",
                Action: "s3:GetObject",
                Resource: "arn:aws:s3:::reports-bucket/*",
                Condition: {
                  StringEquals: { "aws:SourceVpce": "vpce-1a2b3c4d" },
                },
              },
            },
          },
        ],
      });

    // Then the decision was reached over everything the policy said.
    assertTrue(decision.isAllowed);
    assertArrayEmpty(decision.unevaluatedStatements);
  });

  it("says nothing about a statement another operator ruled out", () => {
    // Given a statement whose condition block holds an operator sim IAM
    // cannot read alongside one it can, listed first so that reading in order
    // would reach the unsupported one.
    const simAws = new SimAws();

    // When the supported operator does not match the request.
    const decision = simAws
      .account("123456789012")
      .iam()
      .authorize({
        action: "s3:GetObject",
        resource: "arn:aws:s3:::reports-bucket/summary.csv",
        caller: { kind: "anonymous" },
        conditionContext: { "aws:SourceVpce": "vpce-99999999" },
        resourcePolicies: [
          {
            policyName: "ReportsBucketPolicy",
            document: {
              Version: "2012-10-17",
              Statement: {
                Effect: "Deny",
                Principal: "*",
                Action: "s3:GetObject",
                Resource: "arn:aws:s3:::reports-bucket/*",
                Condition: {
                  DateGreaterThan: {
                    "aws:CurrentTime": "2026-01-01T00:00:00Z",
                  },
                  StringEquals: { "aws:SourceVpce": "vpce-1a2b3c4d" },
                },
              },
            },
          },
        ],
      });

    // Then nothing is reported, because the statement would not have applied
    // to this request whatever the unread operator said.
    assertTrue(decision.isDenied);
    assertArrayEmpty(decision.unevaluatedStatements);
  });

  it("says nothing about a statement the request never reached", () => {
    // Given a statement about another action, holding an operator sim IAM
    // cannot read.
    const simAws = new SimAws();

    // When a request the statement says nothing about is authorized.
    const decision = simAws
      .account("123456789012")
      .iam()
      .authorize({
        action: "s3:GetObject",
        resource: "arn:aws:s3:::reports-bucket/summary.csv",
        caller: { kind: "anonymous" },
        resourcePolicies: [
          {
            policyName: "ReportsBucketPolicy",
            document: {
              Version: "2012-10-17",
              Statement: {
                Effect: "Deny",
                Principal: "*",
                Action: "s3:DeleteObject",
                Resource: "arn:aws:s3:::reports-bucket/*",
                Condition: {
                  DateGreaterThan: {
                    "aws:CurrentTime": "2026-01-01T00:00:00Z",
                  },
                },
              },
            },
          },
        ],
      });

    // Then the condition was beside the point, and nothing is reported.
    assertArrayEmpty(decision.unevaluatedStatements);
  });

  it("names an unnamed resource policy by the resource holding it", () => {
    // Given a Bucket policy supplied by a service without a name of its own.
    const simAws = new SimAws();

    // When it holds a statement sim IAM cannot read.
    const decision = simAws
      .account("123456789012")
      .iam()
      .authorize({
        action: "s3:GetObject",
        resource: "arn:aws:s3:::reports-bucket/summary.csv",
        caller: { kind: "anonymous" },
        resourcePolicies: [
          {
            resourceArn: "arn:aws:s3:::reports-bucket",
            document: {
              Version: "2012-10-17",
              Statement: {
                Effect: "Deny",
                Principal: "*",
                Action: "s3:GetObject",
                Resource: "arn:aws:s3:::reports-bucket/*",
                Condition: {
                  DateGreaterThan: {
                    "aws:CurrentTime": "2026-01-01T00:00:00Z",
                  },
                },
              },
            },
          },
        ],
      });

    // Then the resource it belongs to is what the report calls it.
    assertArrayLength(decision.unevaluatedStatements, 1);
    assertIdentical(
      decision.unevaluatedStatements[0].policy,
      "arn:aws:s3:::reports-bucket",
    );
  });

  it("falls back to how a policy reached the request", () => {
    // Given a policy naming neither itself nor a resource.
    const simAws = new SimAws();

    // When it holds a statement sim IAM cannot read.
    const decision = simAws
      .account("123456789012")
      .iam()
      .authorize({
        action: "s3:GetObject",
        resource: "arn:aws:s3:::reports-bucket/summary.csv",
        caller: { kind: "anonymous" },
        resourcePolicies: [
          {
            document: {
              Version: "2012-10-17",
              Statement: {
                Effect: "Deny",
                Principal: "*",
                Action: "s3:GetObject",
                Resource: "arn:aws:s3:::reports-bucket/*",
                Condition: {
                  DateGreaterThan: {
                    "aws:CurrentTime": "2026-01-01T00:00:00Z",
                  },
                },
              },
            },
          },
        ],
      });

    // Then the report says which side of the decision it came from.
    assertArrayLength(decision.unevaluatedStatements, 1);
    assertIdentical(decision.unevaluatedStatements[0].policy, "resource");
  });
});
