import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertTrue,
  assertTypeString,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamNoSuchEntity } from "../../error/sim-iam.error.js";
import type { SimIamRoleName } from "../../role/sim-iam-role.js";
import type { SimIamUsername } from "../../user/sim-iam-user.js";

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
    const stack = await simAws.cloudFormation().deployTemplate({
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

    // Then both Roles carry the inline policy, under the names the stack
    // generated for them. Neither is named after its logical ID alone.
    for (const logicalId of ["FirstRole", "SecondRole"]) {
      const roleName = stack.getResource(logicalId)?.refValue;
      assertTypeString(roleName);

      const role = simAws.iam().roles.get(roleName as SimIamRoleName);
      assertNonNullable(role);
      assertNonNullable(role.inlinePolicies.get("SharedPolicy"));
    }
  });

  it("puts the inline policy onto referenced Users", async () => {
    // Given a CloudFormation template with a User and an AWS::IAM::Policy
    // referencing it, as a CDK grant against a user attaches permissions.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "iam-user-inline-policy-stack",
      template: {
        Resources: {
          ReaderUser: {
            Type: "AWS::IAM::User",
            Properties: {
              UserName: "ReaderUser",
            },
          },
          ReaderDefaultPolicy: {
            Type: "AWS::IAM::Policy",
            Properties: {
              PolicyName: "ReaderDefaultPolicy",
              PolicyDocument: readPolicyDocument,
              Users: [
                {
                  Ref: "ReaderUser",
                },
              ],
            },
          },
        },
      },
    });

    // Then the User carries the inline policy document.
    const simIam = simAws.iam();
    const user = simIam.users.get("ReaderUser" as SimIamUsername);

    assertNonNullable(user);
    const inlinePolicy = user.inlinePolicies.get("ReaderDefaultPolicy");
    assertNonNullable(inlinePolicy);
    assertIdentical(inlinePolicy, JSON.stringify(readPolicyDocument));

    // And the policy reaches an authorization decision made for the User.
    const decision = simIam.authorize({
      action: "s3:GetObject",
      resource: "arn:aws:s3:::data-bucket/daily.json",
      caller: { kind: "arn", arn: user.arn },
    });

    assertTrue(decision.isAllowed);

    // And the Policy Resource completes without a standalone sim resource.
    const policyResource = stack.getResource("ReaderDefaultPolicy");
    assertNonNullable(policyResource);
    assertUndefined(policyResource.simResource);
  });

  it("puts the inline policy onto a Role and a User together", async () => {
    // Given a template attaching one policy to both a Role and a User.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "iam-mixed-principal-policy-stack",
      template: {
        Resources: {
          SharedRole: {
            Type: "AWS::IAM::Role",
            Properties: {
              AssumeRolePolicyDocument: assumeRolePolicyDocument,
            },
          },
          SharedUser: {
            Type: "AWS::IAM::User",
          },
          SharedPolicy: {
            Type: "AWS::IAM::Policy",
            Properties: {
              PolicyName: "SharedPolicy",
              PolicyDocument: readPolicyDocument,
              Roles: [{ Ref: "SharedRole" }],
              Users: [{ Ref: "SharedUser" }],
            },
          },
        },
      },
    });

    // Then both principals carry the inline policy, under the names the
    // stack generated for them. Neither is named after its logical ID alone.
    const roleName = stack.getResource("SharedRole")?.refValue;
    const username = stack.getResource("SharedUser")?.refValue;

    assertTypeString(roleName);
    assertTypeString(username);

    const simIam = simAws.iam();
    const role = simIam.roles.get(roleName as SimIamRoleName);
    const user = simIam.users.get(username as SimIamUsername);

    assertNonNullable(role);
    assertNonNullable(user);
    assertNonNullable(role.inlinePolicies.get("SharedPolicy"));
    assertNonNullable(user.inlinePolicies.get("SharedPolicy"));
  });

  it("fails the Resource for a Users entry naming no simulated User", async () => {
    // Given a template whose policy names a User the stack never creates.
    const simAws = new SimAws();

    // When the template is deployed, then the Resource fails rather than
    // dropping the grant, as an unknown Role does.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().deployTemplate({
        stackName: "iam-missing-user-policy-stack",
        template: {
          Resources: {
            OrphanPolicy: {
              Type: "AWS::IAM::Policy",
              Properties: {
                PolicyName: "OrphanPolicy",
                PolicyDocument: readPolicyDocument,
                Users: ["AbsentUser"],
              },
            },
          },
        },
      }),
    );

    assertInstanceOf(error, SimIamNoSuchEntity);
  });
});
