import {
  AttachRolePolicyCommand,
  AttachUserPolicyCommand,
  CreateRoleCommand,
  CreateUserCommand,
} from "@aws-sdk/client-iam";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  assertFalse,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { faker } from "@faker-js/faker";
import { describe, it } from "vitest";

import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimIamAccessDenied } from "../../error/sim-iam.error.js";
import type { SimIamRole } from "../../role/sim-iam-role.js";

const lambdaTrustPolicy = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { Service: "lambda.amazonaws.com" },
      Action: "sts:AssumeRole",
    },
  ],
};

/**
 * The ARN CDK writes for an AWS-managed policy, with the partition left to
 * CloudFormation.
 */
function cdkManagedPolicyArn(pathAndName: string): SimCfnTemplateValue {
  return {
    "Fn::Join": [
      "",
      ["arn:", { Ref: "AWS::Partition" }, `:iam::aws:policy/${pathAndName}`],
    ],
  };
}

describe("IAM AWS-managed policy authorization", () => {
  it("grants a Role what an attached AWS-managed policy allows", async () => {
    // Given a Role.
    const simIam = new SimAws().account(makeSimAwsAccountId()).iam();
    const roleName = faker.string.alpha(12);
    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: roleName,
        AssumeRolePolicyDocument: JSON.stringify(lambdaTrustPolicy),
      }),
    );

    // When AWSLambdaBasicExecutionRole is attached to it.
    await simIam.attachRolePolicy(
      new AttachRolePolicyCommand({
        RoleName: roleName,
        PolicyArn:
          "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
      }),
    );

    // Then the Role may write logs, and nothing else.
    const caller = { kind: "arn", arn: roleCreation.Role.Arn } as const;

    assertTrue(
      simIam.authorize({
        caller,
        action: "logs:PutLogEvents",
        resource: "arn:aws:logs:eu-west-2:123456789012:log-group:/aws/x:*",
      }).isAllowed,
    );
    assertFalse(
      simIam.authorize({
        caller,
        action: "s3:GetObject",
        resource: "arn:aws:s3:::any-bucket/any-key",
      }).isAllowed,
    );
  });

  it("grants a User what an attached AWS-managed policy allows", async () => {
    // Given a User.
    const simIam = new SimAws().account(makeSimAwsAccountId()).iam();
    const username = faker.string.alpha(12);
    const userCreation = await simIam.createUser(
      new CreateUserCommand({ UserName: username }),
    );

    // When AmazonSQSReadOnlyAccess is attached to it.
    await simIam.attachUserPolicy(
      new AttachUserPolicyCommand({
        UserName: username,
        PolicyArn: "arn:aws:iam::aws:policy/AmazonSQSReadOnlyAccess",
      }),
    );

    // Then the User may read queue attributes but not send messages.
    const caller = { kind: "arn", arn: userCreation.User.Arn } as const;
    const queueArn = "arn:aws:sqs:eu-west-2:123456789012:orders";

    assertTrue(
      simIam.authorize({
        caller,
        action: "sqs:GetQueueAttributes",
        resource: queueArn,
      }).isAllowed,
    );
    assertFalse(
      simIam.authorize({
        caller,
        action: "sqs:SendMessage",
        resource: queueArn,
      }).isAllowed,
    );
  });

  it("applies the NotAction of PowerUserAccess", async () => {
    // Given a Role with PowerUserAccess attached.
    const simIam = new SimAws().account(makeSimAwsAccountId()).iam();
    const roleName = faker.string.alpha(12);
    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: roleName,
        AssumeRolePolicyDocument: JSON.stringify(lambdaTrustPolicy),
      }),
    );
    await simIam.attachRolePolicy(
      new AttachRolePolicyCommand({
        RoleName: roleName,
        PolicyArn: "arn:aws:iam::aws:policy/PowerUserAccess",
      }),
    );

    // When the Role asks for a DynamoDB action and an IAM one.
    const caller = { kind: "arn", arn: roleCreation.Role.Arn } as const;
    const putItem = simIam.authorize({
      caller,
      action: "dynamodb:PutItem",
      resource: "arn:aws:dynamodb:eu-west-2:123456789012:table/orders",
    });
    const createUser = simIam.authorize({
      caller,
      action: "iam:CreateUser",
      resource: "arn:aws:iam::123456789012:user/intruder",
    });

    // Then DynamoDB is allowed and IAM is not.
    assertTrue(putItem.isAllowed);
    assertFalse(createUser.isAllowed);
  });

  it("grants a CloudFormation Role its ManagedPolicyArns as CDK writes them", async () => {
    // Given a stack with a Bucket and a Role that CDK gave read-only S3
    // access, with the partition left to CloudFormation.
    const scopedAws = new SimAws()
      .account(makeSimAwsAccountId())
      .region("eu-west-2");
    const bucketName = faker.string.alpha(12).toLowerCase();
    const stack = await scopedAws.cloudFormation().deployTemplate({
      stackName: "aws-managed-policy-stack",
      template: {
        Resources: {
          Bucket: {
            Type: "AWS::S3::Bucket",
            Properties: { BucketName: bucketName },
          },
          ReaderRole: {
            Type: "AWS::IAM::Role",
            Properties: {
              AssumeRolePolicyDocument: lambdaTrustPolicy,
              ManagedPolicyArns: [
                cdkManagedPolicyArn("AmazonS3ReadOnlyAccess"),
              ],
            },
          },
        },
      },
    });
    const simS3 = scopedAws.s3();
    await simS3.putObject(
      new PutObjectCommand({ Bucket: bucketName, Key: "report.json" }),
    );
    const roleResource = stack.getResource("ReaderRole");
    assertNonNullable(roleResource);
    const caller = {
      kind: "arn",
      arn: (roleResource.simResource as SimIamRole).arn,
    } as const;

    // When the Role reads the Object, and then tries to write one.
    await simS3.getObject(
      new GetObjectCommand({ Bucket: bucketName, Key: "report.json" }),
      { caller },
    );
    const error = await assertThrowsErrorAsync(async () =>
      simS3.putObject(
        new PutObjectCommand({ Bucket: bucketName, Key: "forged.json" }),
        { caller },
      ),
    );

    // Then the read succeeds and the write is denied.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("grants a CloudFormation User AdministratorAccess", async () => {
    // Given a stack with a User that has AdministratorAccess.
    const scopedAws = new SimAws()
      .account(makeSimAwsAccountId())
      .region("eu-west-2");
    const username = faker.string.alpha(12);
    await scopedAws.cloudFormation().deployTemplate({
      stackName: "aws-managed-admin-stack",
      template: {
        Resources: {
          AdminUser: {
            Type: "AWS::IAM::User",
            Properties: {
              UserName: username,
              ManagedPolicyArns: [cdkManagedPolicyArn("AdministratorAccess")],
            },
          },
        },
      },
    });
    const simIam = scopedAws.iam();
    const user = simIam.users.get(username as never);
    assertNonNullable(user);

    // When the User asks for an IAM action.
    const decision = simIam.authorize({
      caller: { kind: "arn", arn: user.arn },
      action: "iam:CreateRole",
      resource: "arn:aws:iam::123456789012:role/anything",
    });

    // Then it is allowed.
    assertTrue(decision.isAllowed);
  });

  it("grants a policy attached in another partition on that partition's resources", async () => {
    // Given a Role with AWSLambdaExecute attached from the China partition.
    const simIam = new SimAws().account(makeSimAwsAccountId()).iam();
    const roleName = faker.string.alpha(12);
    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: roleName,
        AssumeRolePolicyDocument: JSON.stringify(lambdaTrustPolicy),
      }),
    );
    await simIam.attachRolePolicy(
      new AttachRolePolicyCommand({
        RoleName: roleName,
        PolicyArn: "arn:aws-cn:iam::aws:policy/AWSLambdaExecute",
      }),
    );

    // When the Role reads an Object from a Bucket in that partition.
    const decision = simIam.authorize({
      caller: { kind: "arn", arn: roleCreation.Role.Arn },
      action: "s3:GetObject",
      resource: "arn:aws-cn:s3:::reports/daily.json",
    });

    // Then the policy's S3 statement allows it.
    assertTrue(decision.isAllowed);
  });

  it("attaches an AWS-managed ARN outside the catalogue without granting anything", async () => {
    // Given a Role.
    const simIam = new SimAws().account(makeSimAwsAccountId()).iam();
    const roleName = faker.string.alpha(12);
    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: roleName,
        AssumeRolePolicyDocument: JSON.stringify(lambdaTrustPolicy),
      }),
    );

    // When an AWS-managed policy the catalogue does not hold is attached.
    await simIam.attachRolePolicy(
      new AttachRolePolicyCommand({
        RoleName: roleName,
        PolicyArn: "arn:aws:iam::aws:policy/AmazonMacieFullAccess",
      }),
    );

    // Then the attachment succeeds and the Role gains nothing.
    const decision = simIam.authorize({
      caller: { kind: "arn", arn: roleCreation.Role.Arn },
      action: "macie2:ListFindings",
      resource: "*",
    });

    assertTrue(decision.isImplicitDeny);
  });
});
