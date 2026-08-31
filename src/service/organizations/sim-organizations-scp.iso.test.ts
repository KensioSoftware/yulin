import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertStringIncludes,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../aws/sim-aws.js";
import { makeSimAwsAccountId } from "../aws/sim-aws-account.js";
import { SimIamPolicyDecisionValue } from "../iam/authorize/sim-iam-decision.js";

const denyBucketCreation = {
  Version: "2012-10-17",
  Statement: {
    Sid: "DenyBucketCreation",
    Effect: "Deny",
    Action: "s3:CreateBucket",
    Resource: "*",
  },
} as const;

describe("Simulated Organizations service control policies", () => {
  it("explicitly denies an action a service control policy denies", () => {
    // Given an Account whose organization denies creating Buckets.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });

    simAws
      .organizations()
      .attachServiceControlPolicy(accountId, denyBucketCreation);

    // When the Account root, which every permission is otherwise open to,
    // asks to create one.
    const decision = simAws
      .account(accountId)
      .iam()
      .authorize({
        action: "s3:CreateBucket",
        resource: `arn:aws:s3:::${accountId}-reports`,
      });

    // Then the organization is what stopped it.
    assertIdentical(decision.value, SimIamPolicyDecisionValue.ExplicitDeny);
    assertTrue(decision.serviceControlPolicy.isDenied);
    assertArrayLength(decision.serviceControlPolicy.denyStatements, 1);
    assertIdentical(
      decision.serviceControlPolicy.denyStatements[0].Sid,
      "DenyBucketCreation",
    );
    assertStringIncludes(
      decision.denialReason ?? "",
      "with an explicit deny in a service control policy",
    );
  });

  it("leaves an action the service control policy says nothing about alone", () => {
    // Given the same organization, denying only Bucket creation.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });

    simAws
      .organizations()
      .attachServiceControlPolicy(accountId, denyBucketCreation);

    // When the Account root reads an Object instead.
    const decision = simAws
      .account(accountId)
      .iam()
      .authorize({
        action: "s3:GetObject",
        resource: `arn:aws:s3:::${accountId}-reports/summary.csv`,
      });

    // Then FullAWSAccess carries it through, as it does in a real
    // organization.
    assertTrue(decision.isAllowed);
    assertTrue(decision.serviceControlPolicy.isApplied);
    assertFalse(decision.serviceControlPolicy.isDenied);
    assertArrayLength(decision.serviceControlPolicy.allowStatements, 1);
  });

  it("denies an action an identity policy allows and no service control policy does", async () => {
    // Given a Role allowed to read Objects.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const simIam = simAws.account(accountId).iam();

    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ReportReaderRole",
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: { AWS: `arn:aws:iam::${accountId}:root` },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );

    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "ReportReaderRole",
        PolicyName: "ReadReports",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "s3:GetObject",
            Resource: "*",
          },
        }),
      }),
    );

    // Given an organization whose policies allow DynamoDB and nothing else.
    simAws.organizations().detachFullAwsAccess(accountId);
    simAws.organizations().attachServiceControlPolicy(accountId, {
      Version: "2012-10-17",
      Statement: { Effect: "Allow", Action: "dynamodb:*", Resource: "*" },
    });

    // When the Role uses the permission its identity policy grants.
    const decision = simIam.authorize({
      action: "s3:GetObject",
      resource: `arn:aws:s3:::${accountId}-reports/summary.csv`,
      caller: { kind: "arn", arn: roleCreation.Role.Arn },
    });

    // Then the Account boundary denies it without any statement matching.
    assertIdentical(decision.value, SimIamPolicyDecisionValue.ImplicitDeny);
    assertTrue(decision.serviceControlPolicy.isDenied);
    assertArrayEmpty(decision.serviceControlPolicy.denyStatements);
    assertArrayLength(decision.identityAllowStatements, 1);
    assertStringIncludes(
      decision.denialReason ?? "",
      "because no service control policy allows the s3:GetObject action",
    );
  });

  it("denies everything for an Account left holding no policy", () => {
    // Given an Account inside the organization whose every policy has been
    // taken off it.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });

    simAws.organizations().detachFullAwsAccess(accountId);

    // When the Account root, which holds unrestricted access, asks for
    // anything at all.
    const decision = simAws
      .account(accountId)
      .iam()
      .authorize({
        action: "s3:GetObject",
        resource: `arn:aws:s3:::${accountId}-reports/summary.csv`,
      });

    // Then nothing allows it, which is what AWS does to an account whose
    // policies have all been detached.
    assertIdentical(decision.value, SimIamPolicyDecisionValue.ImplicitDeny);
    assertTrue(decision.serviceControlPolicy.isApplied);
    assertTrue(decision.serviceControlPolicy.isDenied);
    assertArrayEmpty(
      simAws.organizations().serviceControlPoliciesFor(accountId),
    );
  });

  it("blames the identity policy, not the organization, for an explicit Deny", () => {
    // Given an Account whose organization allows nothing, and a resource
    // policy that explicitly denies the same action.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });

    simAws.organizations().detachFullAwsAccess(accountId);

    // When a request matches both.
    const decision = simAws
      .account(accountId)
      .iam()
      .authorize({
        action: "s3:GetObject",
        resource: `arn:aws:s3:::${accountId}-reports/summary.csv`,
        resourcePolicies: [
          {
            document: {
              Version: "2012-10-17",
              Statement: {
                Effect: "Deny",
                Principal: "*",
                Action: "s3:GetObject",
                Resource: "*",
              },
            },
          },
        ],
      });

    // Then the explicit Deny is what decided it, and the message says nothing
    // about a service control policy.
    assertIdentical(decision.value, SimIamPolicyDecisionValue.ExplicitDeny);
    assertArrayLength(decision.explicitDenyStatements, 1);
    assertUndefined(decision.denialReason);
  });

  it("decides an Account with nothing attached as it did before", () => {
    // Given a simulation with an organization holding no policy for this
    // Account.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });

    simAws
      .organizations()
      .attachServiceControlPolicy(makeSimAwsAccountId(), denyBucketCreation);

    // When the Account root asks to create a Bucket.
    const decision = simAws
      .account(accountId)
      .iam()
      .authorize({
        action: "s3:CreateBucket",
        resource: `arn:aws:s3:::${accountId}-reports`,
      });

    // Then another Account's organization policy says nothing about it.
    assertTrue(decision.isAllowed);
    assertFalse(decision.serviceControlPolicy.isApplied);
    assertFalse(decision.serviceControlPolicy.isDenied);
    assertUndefined(decision.denialReason);
  });

  it("puts an Account back outside the organization when its policies are detached", () => {
    // Given an Account denied Bucket creation.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });

    simAws
      .organizations()
      .attachServiceControlPolicy(accountId, denyBucketCreation);

    // When every policy is taken off it.
    simAws.organizations().detachServiceControlPolicies(accountId);

    // Then nothing filters its requests.
    const decision = simAws
      .account(accountId)
      .iam()
      .authorize({
        action: "s3:CreateBucket",
        resource: `arn:aws:s3:::${accountId}-reports`,
      });

    assertTrue(decision.isAllowed);
    assertArrayEmpty(
      simAws.organizations().serviceControlPoliciesFor(accountId),
    );
  });
});
