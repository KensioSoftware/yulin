import {
  assertArrayEquals,
  assertIdentical,
  assertStringIncludes,
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

describe("Simulated Organizations CloudFormation properties", () => {
  it("reads a policy document given as JSON text", async () => {
    // Given a template carrying Content as a JSON string, which is how a
    // template that built the document elsewhere passes it.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "json-content-stack",
      template: {
        Resources: {
          Deny: {
            Type: "AWS::Organizations::Policy",
            Properties: {
              Name: "DenyBucketCreation",
              Type: "SERVICE_CONTROL_POLICY",
              TargetIds: accountId,
              Content: JSON.stringify(denyBucketCreation),
            },
          },
        },
      },
    });

    await stack.waitForDeployComplete();

    // Then it was parsed and attached, and a bare TargetIds read as one
    // target.
    const decision = simAws
      .account(accountId)
      .iam()
      .authorize({
        action: "s3:CreateBucket",
        resource: `arn:aws:s3:::${accountId}-reports`,
      });

    assertIdentical(decision.value, SimIamPolicyDecisionValue.ExplicitDeny);
  });

  it("fails a policy whose Content is not valid JSON", async () => {
    // Given a template whose Content string cannot be parsed.
    const simAws = new SimAws();

    // Then the Resource says so rather than attaching nothing.
    const error = await assertThrowsErrorAsync(async () => {
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "bad-content-stack",
        template: {
          Resources: {
            Deny: {
              Type: "AWS::Organizations::Policy",
              Properties: {
                Name: "Broken",
                Type: "SERVICE_CONTROL_POLICY",
                Content: "{not json",
              },
            },
          },
        },
      });

      await stack.waitForDeployComplete();
    });

    assertStringIncludes(error.message, "Content is not valid JSON");
  });

  it("fails a unit that names no parent", async () => {
    // Given a unit Resource missing its required ParentId.
    const simAws = new SimAws();

    // Then the Resource names the property it needs.
    const error = await assertThrowsErrorAsync(async () => {
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "no-parent-stack",
        template: {
          Resources: {
            Workloads: {
              Type: "AWS::Organizations::OrganizationalUnit",
              Properties: { Name: "Workloads" },
            },
          },
        },
      });

      await stack.waitForDeployComplete();
    });

    assertStringIncludes(error.message, "requires ParentId");
  });

  it("skips an Organizations Resource type it does not model", async () => {
    // Given a template declaring a resource policy alongside a unit.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "resource-policy-stack",
      template: {
        Resources: {
          Workloads: {
            Type: "AWS::Organizations::OrganizationalUnit",
            Properties: {
              Name: "Workloads",
              ParentId: simAws.organizations().root().id,
            },
          },
          Shared: {
            Type: "AWS::Organizations::ResourcePolicy",
            Properties: { Content: {} },
          },
        },
      },
    });

    await stack.waitForDeployComplete();

    // Then it was recorded as skipped and the Stack carried on.
    assertArrayEquals(
      stack.skippedResources.map((skipped) => skipped.logicalId),
      ["Shared"],
    );
  });

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

  it("reads an Organization that names no feature set", async () => {
    // Given an Organization Resource with no properties at all.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "bare-organization-stack",
      template: {
        Resources: {
          Organization: { Type: "AWS::Organizations::Organization" },
        },
        Outputs: {
          RootId: { Value: { "Fn::GetAtt": ["Organization", "RootId"] } },
        },
      },
    });

    await stack.waitForDeployComplete();

    // Then it still answers the value the rest of a template hangs off.
    assertStringIncludes(stack.output("RootId"), "r-");
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
