import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { makeSimAwsAccountId } from "../../aws/sim-aws-account.js";
import { SimIamPolicyDecisionValue } from "../../iam/authorize/sim-iam-decision-value.js";

const denyBucketCreation = {
  Version: "2012-10-17",
  Statement: [{ Effect: "Deny", Action: "s3:CreateBucket", Resource: "*" }],
};

describe("Simulated Organizations CloudFormation teardown", () => {
  it("moves a nested unit up when the unit above it goes", async () => {
    // Given a Stack with a unit inside a unit, and an Account under the inner
    // one.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const organizations = simAws.organizations();

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "nested-unit-stack",
      template: {
        Resources: {
          Workloads: {
            Type: "AWS::Organizations::OrganizationalUnit",
            Properties: {
              Name: "Workloads",
              ParentId: organizations.root().id,
            },
          },
          Production: {
            Type: "AWS::Organizations::OrganizationalUnit",
            Properties: { Name: "Production", ParentId: { Ref: "Workloads" } },
          },
        },
        Outputs: {
          WorkloadsId: { Value: { Ref: "Workloads" } },
          ProductionId: { Value: { Ref: "Production" } },
        },
      },
    });

    await stack.waitForDeployComplete();
    organizations.moveAccount(accountId, stack.output("ProductionId"));

    // When only the outer unit is taken away.
    organizations.removeOrganizationalUnit(stack.output("WorkloadsId"));

    // Then the Account still has a path back to the root.
    assertArrayEquals(
      organizations
        .serviceControlPolicySetFor(accountId)
        .levels.map((level) => level.nodeName),
      ["Root", "Production", accountId],
    );
  });

  it("tears down when a policy's target unit has already gone", async () => {
    // Given a Stack whose policy targets an Account and a unit created
    // outside it.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const organizations = simAws.organizations();
    const outside = organizations.createOrganizationalUnit("Outside");

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "detach-order-stack",
      template: {
        Resources: {
          Deny: {
            Type: "AWS::Organizations::Policy",
            Properties: {
              Name: "DenyBucketCreation",
              Type: "SERVICE_CONTROL_POLICY",
              TargetIds: [outside.id, accountId],
              Content: denyBucketCreation,
            },
          },
        },
      },
    });

    await stack.waitForDeployComplete();

    // When that unit goes before the Stack comes down.
    organizations.removeOrganizationalUnit(outside);

    // Then the teardown gets past the unit that has gone and still takes the
    // policy off the Account.
    await stack.teardown();

    const decision = simAws
      .account(accountId)
      .iam()
      .authorize({
        action: "s3:CreateBucket",
        resource: `arn:aws:s3:::${accountId}-reports`,
      });

    assertTrue(decision.isAllowed);
  });

  it("leaves another Stack's policy on a node it shares", async () => {
    // Given two Stacks whose policies both target the same Account.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });

    const policyStack = (stackName: string) =>
      simAws.cloudFormation().deployTemplate({
        stackName,
        template: {
          Resources: {
            Deny: {
              Type: "AWS::Organizations::Policy",
              Properties: {
                Name: stackName,
                Type: "SERVICE_CONTROL_POLICY",
                TargetIds: [accountId],
                Content: denyBucketCreation,
              },
            },
          },
        },
      });

    const first = await policyStack("guardrails");
    const second = await policyStack("extra-guardrails");

    await first.waitForDeployComplete();
    await second.waitForDeployComplete();

    // When one of them comes down.
    await second.teardown();

    // Then the other Stack's policy is still denying.
    const decision = simAws
      .account(accountId)
      .iam()
      .authorize({
        action: "s3:CreateBucket",
        resource: `arn:aws:s3:::${accountId}-reports`,
      });

    assertIdentical(decision.value, SimIamPolicyDecisionValue.ExplicitDeny);
    assertArrayLength(decision.serviceControlPolicy.denyStatements, 1);
  });

  it("attaches a policy to no target when one of them is unknown", async () => {
    // Given a policy naming a good target and a unit from elsewhere.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const foreign = new SimAws()
      .organizations()
      .createOrganizationalUnit("Other");

    // When the Stack is deployed.
    await assertThrowsErrorAsync(async () => {
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "partial-attach-stack",
        template: {
          Resources: {
            Deny: {
              Type: "AWS::Organizations::Policy",
              Properties: {
                Name: "DenyBucketCreation",
                Type: "SERVICE_CONTROL_POLICY",
                TargetIds: [accountId, foreign.id],
                Content: denyBucketCreation,
              },
            },
          },
        },
      });

      await stack.waitForDeployComplete();
    });

    // Then the good target was left alone, rather than holding a policy no
    // teardown knows about.
    assertTrue(
      !simAws.organizations().serviceControlPolicySetFor(accountId).applies,
    );
  });

  it("takes a deployed Account back out of the organization", async () => {
    // Given a Stack that created an Account under a denying unit.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "account-teardown-stack",
      template: {
        Resources: {
          Workloads: {
            Type: "AWS::Organizations::OrganizationalUnit",
            Properties: {
              Name: "Workloads",
              ParentId: simAws.organizations().root().id,
            },
          },
          Payments: {
            Type: "AWS::Organizations::Account",
            Properties: {
              AccountName: "Payments",
              Email: "payments@example.com",
              ParentIds: [{ Ref: "Workloads" }],
              RoleName: "OrganizationAccountAccessRole",
            },
          },
          Deny: {
            Type: "AWS::Organizations::Policy",
            Properties: {
              Name: "DenyBucketCreation",
              Type: "SERVICE_CONTROL_POLICY",
              TargetIds: [{ Ref: "Workloads" }],
              Content: denyBucketCreation,
            },
          },
        },
        Outputs: { AccountId: { Value: { Ref: "Payments" } } },
      },
    });

    await stack.waitForDeployComplete();

    const accountId = stack.output("AccountId");

    assertTrue(
      simAws.organizations().serviceControlPolicySetFor(accountId).applies,
    );

    // When the Stack comes down.
    await stack.teardown();

    // Then the Account is no longer in the organization.
    assertTrue(
      !simAws.organizations().serviceControlPolicySetFor(accountId).applies,
    );
  });
});
