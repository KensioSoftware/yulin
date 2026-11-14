import {
  assertIdentical,
  assertMapSize,
  assertStringIncludes,
  assertStringStartsWith,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";

const trustEc2: SimCfnTemplateValueRecord = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { Service: "ec2.amazonaws.com" },
      Action: "sts:AssumeRole",
    },
  ],
};

const role = (RoleName: string): SimCfnTemplateValueRecord => ({
  Type: "AWS::IAM::Role",
  Properties: { RoleName, AssumeRolePolicyDocument: trustEc2 },
});

describe("IAM CloudFormation InstanceProfile", () => {
  it("creates an instance profile holding the Role it names, and tears both down", async () => {
    // Given a Stack with a Role and an unnamed instance profile holding it
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "fleet-stack",
      template: {
        Resources: {
          WebRole: role("web"),
          WebProfile: {
            Type: "AWS::IAM::InstanceProfile",
            Properties: { Path: "/fleet/", Roles: [{ Ref: "WebRole" }] },
          },
        },
        Outputs: {
          ProfileName: { Value: { Ref: "WebProfile" } },
          ProfileArn: { Value: { "Fn::GetAtt": ["WebProfile", "Arn"] } },
        },
      },
    });
    const iam = simAws.iam();
    const held = iam.instanceProfiles.values().next().value?.roleName;

    // When the Stack is torn down
    await stack.teardown();

    // Then the profile held the Role under a generated name, and nothing is
    // left
    assertIdentical(held, "web");
    assertStringStartsWith(
      stack.output("ProfileName"),
      "fleet-stack-WebProfile",
    );
    assertStringIncludes(
      stack.output("ProfileArn"),
      ":instance-profile/fleet/",
    );
    assertMapSize(iam.instanceProfiles, 0);
    assertMapSize(iam.roles, 0);
  });

  it("refuses an instance profile naming two Roles before creating it", async () => {
    // Given a template whose instance profile names two Roles
    const simAws = new SimAws();

    // When it is deployed
    const error = await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().deployTemplate({
        stackName: "pair-stack",
        template: {
          Resources: {
            First: role("first"),
            Second: role("second"),
            Pair: {
              Type: "AWS::IAM::InstanceProfile",
              Properties: {
                InstanceProfileName: "pair",
                Roles: [{ Ref: "First" }, { Ref: "Second" }],
              },
            },
          },
        },
      }),
    );

    // Then the deployment fails, and no profile was created
    assertStringIncludes(error.message, "Roles holds one Role at most");
    assertMapSize(simAws.iam().instanceProfiles, 0);
  });
});
