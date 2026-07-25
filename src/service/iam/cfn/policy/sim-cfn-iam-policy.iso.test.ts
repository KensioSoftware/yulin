import {
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimIamRoleName } from "../../role/sim-iam-role.js";

const assumeRolePolicyDocument = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: {
        Service: "lambda.amazonaws.com",
      },
      Action: "sts:AssumeRole",
    },
  ],
};

const readPolicyDocument = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Action: "s3:GetObject",
      Resource: "arn:aws:s3:::data-bucket/*",
    },
  ],
};

describe("IAM CloudFormation Policy", () => {
  it("puts the inline policy onto referenced Roles", async () => {
    // Given a CloudFormation template with a Role and an AWS::IAM::Policy
    // referencing it, as CDK grants attach permissions to execution roles.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "iam-inline-policy-stack",
      template: {
        Resources: {
          ReaderRole: {
            Type: "AWS::IAM::Role",
            Properties: {
              RoleName: "ReaderRole",
              AssumeRolePolicyDocument: assumeRolePolicyDocument,
            },
          },
          ReaderDefaultPolicy: {
            Type: "AWS::IAM::Policy",
            Properties: {
              PolicyName: "ReaderDefaultPolicy",
              PolicyDocument: readPolicyDocument,
              Roles: [
                {
                  Ref: "ReaderRole",
                },
              ],
            },
          },
        },
      },
    });

    // Then the Role carries the inline policy document.
    const role = simAws.iam().roles.get("ReaderRole" as SimIamRoleName);

    assertNonNullable(role);
    const inlinePolicy = role.inlinePolicies.get("ReaderDefaultPolicy");
    assertNonNullable(inlinePolicy);
    assertIdentical(inlinePolicy, JSON.stringify(readPolicyDocument));

    // And the Policy Resource completes without a standalone sim resource.
    const policyResource = stack.getResource("ReaderDefaultPolicy");
    assertNonNullable(policyResource);
    assertUndefined(policyResource.simResource);
  });

  it("puts the inline policy onto multiple referenced Roles", async () => {
    // Given a template attaching one policy to two Roles.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation.
    await simAws.cloudFormation().deployTemplate({
      stackName: "iam-shared-policy-stack",
      template: {
        Resources: {
          FirstRole: {
            Type: "AWS::IAM::Role",
            Properties: {
              AssumeRolePolicyDocument: assumeRolePolicyDocument,
            },
          },
          SecondRole: {
            Type: "AWS::IAM::Role",
            Properties: {
              AssumeRolePolicyDocument: assumeRolePolicyDocument,
            },
          },
          SharedPolicy: {
            Type: "AWS::IAM::Policy",
            Properties: {
              PolicyName: "SharedPolicy",
              PolicyDocument: readPolicyDocument,
              Roles: [
                {
                  Ref: "FirstRole",
                },
                {
                  Ref: "SecondRole",
                },
              ],
            },
          },
        },
      },
    });

    // Then both Roles carry the inline policy.
    for (const roleName of ["FirstRole", "SecondRole"]) {
      const role = simAws.iam().roles.get(roleName as SimIamRoleName);
      assertNonNullable(role);
      assertNonNullable(role.inlinePolicies.get("SharedPolicy"));
    }
  });
});
