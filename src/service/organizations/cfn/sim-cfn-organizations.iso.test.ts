import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertStringIncludes,
  assertStringLength,
  assertStringStartsWith,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { makeSimAwsAccountId } from "../../aws/sim-aws-account.js";
import { SimIamPolicyDecisionValue } from "../../iam/authorize/sim-iam-decision-value.js";

const organizationTemplate = {
  Resources: {
    Organization: {
      Type: "AWS::Organizations::Organization",
      Properties: { FeatureSet: "ALL" },
    },
    Workloads: {
      Type: "AWS::Organizations::OrganizationalUnit",
      Properties: {
        Name: "Workloads",
        ParentId: { "Fn::GetAtt": ["Organization", "RootId"] },
      },
    },
    DenyBucketCreation: {
      Type: "AWS::Organizations::Policy",
      Properties: {
        Name: "DenyBucketCreation",
        Type: "SERVICE_CONTROL_POLICY",
        TargetIds: [{ Ref: "Workloads" }],
        Content: {
          Version: "2012-10-17",
          Statement: [
            { Effect: "Deny", Action: "s3:CreateBucket", Resource: "*" },
          ],
        },
      },
    },
  },
  Outputs: {
    WorkloadsId: { Value: { Ref: "Workloads" } },
  },
};

describe("Simulated Organizations from CloudFormation", () => {
  it("denies an Account under the unit the deployed policy targets", async () => {
    // Given a Stack declaring a unit and a policy that targets it.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "org-stack",
      template: organizationTemplate,
    });

    await stack.waitForDeployComplete();

    // When an Account is put under that unit and asks to create a Bucket.
    simAws.organizations().moveAccount(accountId, stack.output("WorkloadsId"));

    const decision = simAws
      .account(accountId)
      .iam()
      .authorize({
        action: "s3:CreateBucket",
        resource: `arn:aws:s3:::${accountId}-reports`,
      });

    // Then the deployed policy denied it.
    assertIdentical(decision.value, SimIamPolicyDecisionValue.ExplicitDeny);
    assertArrayLength(decision.serviceControlPolicy.denyStatements, 1);
  });

  it("resolves Ref and GetAtt for each Resource type", async () => {
    // Given a deployed organization Stack that also creates an Account.
    const simAws = new SimAws();
    const template = {
      Resources: {
        ...organizationTemplate.Resources,
        Payments: {
          Type: "AWS::Organizations::Account",
          Properties: {
            AccountName: "Payments",
            Email: "payments@example.com",
            ParentIds: [{ Ref: "Workloads" }],
          },
        },
      },
      Outputs: {
        ...organizationTemplate.Outputs,
        RootId: { Value: { "Fn::GetAtt": ["Organization", "RootId"] } },
        UnitRef: { Value: { Ref: "Workloads" } },
        UnitName: { Value: { "Fn::GetAtt": ["Workloads", "Name"] } },
        OrgRef: { Value: { Ref: "Organization" } },
        OrgArn: { Value: { "Fn::GetAtt": ["Organization", "Arn"] } },
        OrgManagementId: {
          Value: { "Fn::GetAtt": ["Organization", "ManagementAccountId"] },
        },
        OrgManagementArn: {
          Value: { "Fn::GetAtt": ["Organization", "ManagementAccountArn"] },
        },
        UnitArn: { Value: { "Fn::GetAtt": ["Workloads", "Arn"] } },
        AccountId: { Value: { "Fn::GetAtt": ["Payments", "AccountId"] } },
        AccountArn: { Value: { "Fn::GetAtt": ["Payments", "Arn"] } },
        AccountEmail: { Value: { "Fn::GetAtt": ["Payments", "Email"] } },
        AccountJoined: {
          Value: { "Fn::GetAtt": ["Payments", "JoinedMethod"] },
        },
        AccountStatus: { Value: { "Fn::GetAtt": ["Payments", "Status"] } },
        PolicyRef: { Value: { Ref: "DenyBucketCreation" } },
        PolicyId: { Value: { "Fn::GetAtt": ["DenyBucketCreation", "Id"] } },
        PolicyArn: { Value: { "Fn::GetAtt": ["DenyBucketCreation", "Arn"] } },
      },
    };

    const stack = await simAws
      .cloudFormation()
      .deployTemplate({ stackName: "org-values-stack", template });

    await stack.waitForDeployComplete();

    // When the outputs are read.
    // Then each carries the value the AWS Resource reference gives.
    assertStringStartsWith(stack.output("RootId"), "r-");
    assertStringStartsWith(stack.output("OrgRef"), "o-");
    assertStringStartsWith(stack.output("OrgArn"), "arn:aws:organizations::");
    assertStringLength(stack.output("OrgManagementId"), 12);
    assertStringIncludes(stack.output("OrgManagementArn"), ":account/");
    assertStringStartsWith(stack.output("UnitRef"), "ou-");
    assertIdentical(stack.output("UnitName"), "Workloads");
    assertStringIncludes(stack.output("UnitArn"), "organizational-unit/ou-");
    assertStringLength(stack.output("AccountId"), 12);
    assertStringIncludes(stack.output("AccountArn"), ":account/");
    assertIdentical(stack.output("AccountEmail"), "payments@example.com");
    assertIdentical(stack.output("AccountJoined"), "CREATED");
    assertIdentical(stack.output("AccountStatus"), "ACTIVE");
    assertStringStartsWith(stack.output("PolicyRef"), "p-");
    assertIdentical(stack.output("PolicyId"), stack.output("PolicyRef"));
    assertStringIncludes(
      stack.output("PolicyArn"),
      "policy/service_control_policy/p-",
    );
  });

  it("refuses an attribute the AWS Resource reference does not list", async () => {
    // Given a Stack reading an attribute no Organizations Resource has.
    const simAws = new SimAws();

    // Then the deployment says which attribute it has no answer for.
    const error = await assertThrowsErrorAsync(async () => {
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "bad-attribute-stack",
        template: {
          Resources: {
            Workloads: {
              Type: "AWS::Organizations::OrganizationalUnit",
              Properties: {
                Name: "Workloads",
                ParentId: simAws.organizations().root().id,
              },
            },
          },
          Outputs: {
            Nonsense: { Value: { "Fn::GetAtt": ["Workloads", "Nonsense"] } },
          },
        },
      });

      await stack.waitForDeployComplete();
    });

    assertStringIncludes(error.message, "Nonsense");
  });

  it("skips a policy type it evaluates nothing for and deploys on", async () => {
    // Given a Stack carrying a tag policy alongside a unit.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "tag-policy-stack",
      template: {
        Resources: {
          Workloads: {
            Type: "AWS::Organizations::OrganizationalUnit",
            Properties: {
              Name: "Workloads",
              ParentId: simAws.organizations().root().id,
            },
          },
          CostCentre: {
            Type: "AWS::Organizations::Policy",
            Properties: {
              Name: "CostCentre",
              Type: "TAG_POLICY",
              Content: { tags: {} },
            },
          },
        },
      },
    });

    await stack.waitForDeployComplete();

    // Then the tag policy was recorded as skipped and the unit still exists.
    assertArrayEquals(
      stack.skippedResources.map((skipped) => skipped.logicalId),
      ["CostCentre"],
    );
    assertNonNullable(stack.getResource("Workloads")?.simResource);
  });

  it("takes the organization back down with the Stack", async () => {
    // Given a deployed organization Stack.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "org-teardown",
      template: organizationTemplate,
    });

    await stack.waitForDeployComplete();

    simAws.organizations().moveAccount(accountId, stack.output("WorkloadsId"));

    // When the Stack is deleted.
    await stack.teardown();

    // Then the policy is off the unit, so nothing denies the Account.
    const decision = simAws
      .account(accountId)
      .iam()
      .authorize({
        action: "s3:CreateBucket",
        resource: `arn:aws:s3:::${accountId}-reports`,
      });

    assertTrue(decision.isAllowed);
    assertArrayLength(decision.serviceControlPolicy.denyStatements, 0);
  });
});
