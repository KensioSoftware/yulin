import {
  assertArrayEmpty,
  assertArrayEquals,
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { makeSimAwsAccountId } from "../../aws/sim-aws-account.js";
import { SimIamPolicyDecisionValue } from "../../iam/authorize/sim-iam-decision-value.js";

const denyBucketCreation = {
  Version: "2012-10-17",
  Statement: [{ Effect: "Deny", Action: "s3:CreateBucket", Resource: "*" }],
};

/**
 * The Accounts a simulated organization has been told about.
 */
const organizationAccountIds = (simAws: SimAws): readonly string[] =>
  simAws.organizations().accountIds();

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

  it("fails a policy whose Content is not a document", async () => {
    // Given a template whose Content is a number.
    const simAws = new SimAws();

    // Then the Resource says what it needed.
    const error = await assertThrowsErrorAsync(async () => {
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "scalar-content-stack",
        template: {
          Resources: {
            Deny: {
              Type: "AWS::Organizations::Policy",
              Properties: {
                Name: "Broken",
                Type: "SERVICE_CONTROL_POLICY",
                Content: 5,
              },
            },
          },
        },
      });

      await stack.waitForDeployComplete();
    });

    assertStringIncludes(error.message, "requires Content to be a policy");
  });

  it("leaves an Account out of the organization when its Email is missing", async () => {
    // Given an Account Resource with no Email.
    const simAws = new SimAws();

    // When the Stack is deployed.
    await assertThrowsErrorAsync(async () => {
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "no-email-stack",
        template: {
          Resources: {
            Payments: {
              Type: "AWS::Organizations::Account",
              Properties: { AccountName: "Payments" },
            },
          },
        },
      });

      await stack.waitForDeployComplete();
    });

    // Then nothing was placed in the organization on the way to failing.
    assertArrayEmpty(organizationAccountIds(simAws));
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
});
