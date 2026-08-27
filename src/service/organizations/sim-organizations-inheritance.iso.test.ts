import {
  assertArrayEquals,
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertStringStartsWith,
  assertThrowsError,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../aws/sim-aws.js";
import { makeSimAwsAccountId } from "../aws/sim-aws-account.js";
import { SimIamPolicyDecisionValue } from "../iam/authorize/sim-iam-decision-value.js";
import {
  SimOrganizationsTree,
  SimOrganizationsUnknownNode,
} from "./tree/sim-organizations-tree.js";

const allowOnly = (action: string) => ({
  Version: "2012-10-17",
  Statement: { Effect: "Allow" as const, Action: action, Resource: "*" },
});

describe("Simulated Organizations policy inheritance", () => {
  it("denies an Account beneath the organizational unit the policy hangs on", () => {
    // Given an Account in a unit whose policy denies creating Buckets.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const organizations = simAws.organizations();
    const workloads = organizations.createOrganizationalUnit("Workloads");

    organizations.moveAccount(accountId, workloads);
    organizations.attachServiceControlPolicy(workloads, {
      Version: "2012-10-17",
      Statement: {
        Sid: "DenyBucketCreation",
        Effect: "Deny",
        Action: "s3:CreateBucket",
        Resource: "*",
      },
    });

    // When the Account asks to create one.
    const decision = simAws
      .account(accountId)
      .iam()
      .authorize({
        action: "s3:CreateBucket",
        resource: `arn:aws:s3:::${accountId}-reports`,
      });

    // Then the unit above it denied the request, with nothing attached to the
    // Account itself.
    assertIdentical(decision.value, SimIamPolicyDecisionValue.ExplicitDeny);
    assertIdentical(
      decision.serviceControlPolicy.denyStatements[0]?.Sid,
      "DenyBucketCreation",
    );
  });

  it("inherits a policy through nested organizational units", () => {
    // Given an Account two units deep, denied at the outer one.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const organizations = simAws.organizations();
    const workloads = organizations.createOrganizationalUnit("Workloads");
    const production = organizations.createOrganizationalUnit(
      "Production",
      workloads,
    );

    organizations.moveAccount(accountId, production);
    organizations.attachServiceControlPolicy(workloads, {
      Version: "2012-10-17",
      Statement: { Effect: "Deny", Action: "s3:*", Resource: "*" },
    });

    // When the Account reads an Object.
    const decision = simAws
      .account(accountId)
      .iam()
      .authorize({
        action: "s3:GetObject",
        resource: `arn:aws:s3:::${accountId}-reports/summary.csv`,
      });

    // Then the policy reached it through the unit in between.
    assertTrue(decision.serviceControlPolicy.isExplicitDeny);
    assertArrayEquals(
      simAws
        .organizations()
        .serviceControlPolicySetFor(accountId)
        .levels.map((level) => level.nodeName),
      ["Root", "Workloads", "Production", accountId],
    );
  });

  it("requires every level to allow the action, not just one of them", () => {
    // Given a root allowing only S3 and a unit allowing only DynamoDB.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const organizations = simAws.organizations();
    const workloads = organizations.createOrganizationalUnit("Workloads");

    organizations.moveAccount(accountId, workloads);

    organizations.detachFullAwsAccess(organizations.root());
    organizations.attachServiceControlPolicy(
      organizations.root(),
      allowOnly("s3:*"),
    );

    organizations.detachFullAwsAccess(workloads);
    organizations.attachServiceControlPolicy(
      workloads,
      allowOnly("dynamodb:*"),
    );

    // When the Account asks for the action only the root allows.
    const decision = simAws
      .account(accountId)
      .iam()
      .authorize({
        action: "s3:GetObject",
        resource: `arn:aws:s3:::${accountId}-reports/summary.csv`,
      });

    // Then the unit that allowed nothing matching is what denied it.
    assertIdentical(decision.value, SimIamPolicyDecisionValue.ImplicitDeny);
    assertArrayEquals(decision.serviceControlPolicy.unallowedLevels, [
      "Workloads",
    ]);
  });

  it("leaves a Deny at one level standing against an Allow at another", () => {
    // Given a unit denying Bucket creation and the Account allowing it.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const organizations = simAws.organizations();
    const workloads = organizations.createOrganizationalUnit("Workloads");

    organizations.moveAccount(accountId, workloads);
    organizations.attachServiceControlPolicy(workloads, {
      Version: "2012-10-17",
      Statement: { Effect: "Deny", Action: "s3:CreateBucket", Resource: "*" },
    });
    organizations.attachServiceControlPolicy(
      accountId,
      allowOnly("s3:CreateBucket"),
    );

    // When the Account asks to create a Bucket.
    const decision = simAws
      .account(accountId)
      .iam()
      .authorize({
        action: "s3:CreateBucket",
        resource: `arn:aws:s3:::${accountId}-reports`,
      });

    // Then the Deny above it wins, as it does in AWS.
    assertIdentical(decision.value, SimIamPolicyDecisionValue.ExplicitDeny);
  });

  it("exempts the management account from every policy above it", () => {
    // Given a management account in a unit that denies everything.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const organizations = simAws.organizations();
    const workloads = organizations.createOrganizationalUnit("Workloads");

    organizations.moveAccount(accountId, workloads);
    organizations.attachServiceControlPolicy(workloads, {
      Version: "2012-10-17",
      Statement: { Effect: "Deny", Action: "*", Resource: "*" },
    });
    organizations.setManagementAccount(accountId);

    // When it asks for something that policy denies.
    const decision = simAws
      .account(accountId)
      .iam()
      .authorize({
        action: "s3:CreateBucket",
        resource: `arn:aws:s3:::${accountId}-reports`,
      });

    // Then no service control policy was applied to it at all.
    assertTrue(decision.isAllowed);
    assertFalse(decision.serviceControlPolicy.isApplied);
    assertArrayLength(
      organizations.serviceControlPolicySetFor(accountId).levels,
      0,
    );
  });

  it("takes a policy back off an organizational unit", () => {
    // Given an Account under a unit that denies Bucket creation.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const organizations = simAws.organizations();
    const workloads = organizations.createOrganizationalUnit("Workloads");

    organizations.moveAccount(accountId, workloads);
    organizations.attachServiceControlPolicy(workloads, {
      Version: "2012-10-17",
      Statement: { Effect: "Deny", Action: "s3:CreateBucket", Resource: "*" },
    });

    // When the unit's policies are taken off it.
    organizations.detachServiceControlPolicies(workloads);

    // Then the Account is left in the organization, and the unit allows
    // everything through it again.
    const decision = simAws
      .account(accountId)
      .iam()
      .authorize({
        action: "s3:CreateBucket",
        resource: `arn:aws:s3:::${accountId}-reports`,
      });

    assertTrue(decision.isAllowed);
    assertTrue(decision.serviceControlPolicy.isApplied);
  });

  it("gives no path for an Account outside the tree", () => {
    // Given an organization holding no Accounts.
    const tree = new SimOrganizationsTree();

    // When the path to an Account it never placed is asked for.
    // Then there is none, and no level filters that Account.
    assertArrayLength(tree.pathTo(makeSimAwsAccountId()), 0);
  });

  it("gives the root and its units AWS-shaped ids", () => {
    const simAws = new SimAws();
    const organizations = simAws.organizations();
    const workloads = organizations.createOrganizationalUnit("Workloads");

    assertStringStartsWith(organizations.root().id, "r-");
    assertStringStartsWith(workloads.id, "ou-");
    assertIdentical(workloads.parentId, organizations.root().id);
  });

  it("refuses an organizational unit from another organization", () => {
    // Given a unit belonging to a different simulated organization.
    const other = new SimAws()
      .organizations()
      .createOrganizationalUnit("Other");
    const simAws = new SimAws();

    // When it is used as a parent here.
    // Then the organization refuses it rather than inventing a branch.
    const error = assertThrowsError(() =>
      simAws.organizations().createOrganizationalUnit("Child", other),
    );

    assertInstanceOf(error, SimOrganizationsUnknownNode);
  });
});
