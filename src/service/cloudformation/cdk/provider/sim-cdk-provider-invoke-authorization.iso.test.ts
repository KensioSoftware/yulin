import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertStringNotIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { faker } from "@faker-js/faker";
import { describe, it } from "vitest";

import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { simIamPolicyDocumentFactory } from "../../../iam/policy/sim-iam-policy-document.factory.js";
import { simIamRoleWithPolicyFactory } from "../../../iam/role/sim-iam-role-with-policy.factory.js";
import { simCdkBucketNotificationsTemplateFactory } from "../s3/bucket-notifications/sim-cdk-bucket-notifications-template.factory.js";

describe("the invoke a custom Resource's provider costs a deployment", () => {
  /** The provider ARN the bucket notification template's ServiceToken names. */
  const providerArn = "arn:aws:lambda:us-east-1:888888888888:function:cdk";

  /** A deploy Role allowed the actions it is given, on every resource. */
  async function deployRole(
    simAws: SimAws,
    actions: readonly string[],
  ): Promise<{ readonly caller: SimAwsCaller; readonly roleName: string }> {
    const roleName = `deployer-${faker.string.uuid()}`;
    const role = await simIamRoleWithPolicyFactory.make(
      { roleName, policyName: `${roleName}-policy`, actions },
      simAws,
    );

    return { caller: { kind: "arn", arn: role.Arn }, roleName };
  }

  /** Every action deploying the notification template needs but the invoke. */
  const deployActions = [
    "s3:CreateBucket",
    "s3:PutBucketNotification",
    "lambda:CreateFunction",
    "lambda:AddPermission",
    "iam:CreateRole",
    "iam:PassRole",
  ];

  it("refuses a Stack whose deploy Role cannot invoke the provider", async () => {
    // Given a deploy Role holding everything the template needs except the
    // invoke of the provider function CloudFormation answers the custom
    // Resource with.
    const simAws = new SimAws();
    const stackName = `uploads-${faker.string.uuid()}`;
    const { caller, roleName } = await deployRole(simAws, deployActions);

    // When the Stack is deployed as that Role.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName,
        template: simCdkBucketNotificationsTemplateFactory.make({}),
        caller,
      });
    });

    // Then it is refused on the invoke, as the real deployment is.
    assertStringIncludes(error.message, "lambda:InvokeFunction");
    assertStringIncludes(error.message, providerArn);
    assertStringIncludes(error.message, `role/${roleName}`);
    assertIdentical(
      simAws
        .cloudFormation()
        .getStackByName(stackName)
        ?.getResource("BucketNotifications")?.status,
      "CREATE_FAILED",
    );
  });

  it("deploys a Stack whose deploy Role may invoke the provider", async () => {
    // Given a deploy Role allowed the invoke alongside the rest.
    const simAws = new SimAws();
    const stackName = `uploads-${faker.string.uuid()}`;
    const bucketName = `uploads-${faker.string.uuid()}`;
    const { caller } = await deployRole(simAws, [
      ...deployActions,
      "lambda:InvokeFunction",
    ]);

    // When the Stack is deployed as that Role.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName,
      template: simCdkBucketNotificationsTemplateFactory.make({ bucketName }),
      caller,
    });

    // Then the notification configuration reached the Bucket.
    assertIdentical(
      stack.getResource("BucketNotifications")?.status,
      "CREATE_COMPLETE",
    );
    const configuration = await simAws
      .s3()
      .getBucketNotificationConfiguration({ input: { Bucket: bucketName } });
    assertIdentical(configuration.LambdaFunctionConfigurations?.length, 1);
  });

  it("refuses a teardown whose deploy Role cannot invoke the provider", async () => {
    // Given a Stack deployed by a Role that could invoke the provider, whose
    // policy is narrowed to take that invoke away again before the teardown.
    const simAws = new SimAws();
    const stackName = `uploads-${faker.string.uuid()}`;
    const { caller, roleName } = await deployRole(simAws, [
      ...deployActions,
      "lambda:InvokeFunction",
    ]);
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName,
      template: simCdkBucketNotificationsTemplateFactory.make({}),
      caller,
    });

    await simAws.iam().putRolePolicy({
      input: {
        RoleName: roleName,
        PolicyName: `${roleName}-policy`,
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: { Action: deployActions, Resource: "*" },
        }),
      },
    });

    // When the Stack is torn down.
    const error = await assertThrowsErrorAsync(async () => {
      await stack.teardown();
    });

    // Then the teardown is refused, as CloudFormation sends the provider a
    // Delete event of its own.
    assertStringIncludes(error.message, "lambda:InvokeFunction");
    assertStringIncludes(error.message, providerArn);
  });

  it("authorizes the notification put as the deploying caller", async () => {
    // Given a deploy Role that may invoke the provider and may do everything
    // else the template needs, apart from writing the Bucket's notification
    // configuration.
    const simAws = new SimAws();
    const stackName = `uploads-${faker.string.uuid()}`;
    const { caller, roleName } = await deployRole(simAws, [
      ...deployActions.filter(
        (action) => action !== "s3:PutBucketNotification",
      ),
      "lambda:InvokeFunction",
    ]);

    // When the Stack is deployed as that Role.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName,
        template: simCdkBucketNotificationsTemplateFactory.make({}),
        caller,
      });
    });

    // Then the custom Resource's own S3 call is refused too, rather than
    // being decided as the Account root.
    assertStringIncludes(error.message, "s3:PutBucketNotification");
    assertStringIncludes(error.message, `role/${roleName}`);
  });

  it("names the provider function CDK's Fn::GetAtt stands in for", async () => {
    // Given the shape CDK synthesizes, where ServiceToken is an Fn::GetAtt for
    // a Python provider function this simulator declines and leaves uncreated,
    // so the attribute resolves to a stand-in rather than to an ARN.
    const simAws = new SimAws();
    const stackName = `uploads-${faker.string.uuid()}`;
    const { caller } = await deployRole(simAws, deployActions);

    // When a Stack holding it is deployed as a Role without the invoke.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName,
        template: simCdkBucketNotificationsTemplateFactory.make({
          notificationProperties: {
            ServiceToken: { "Fn::GetAtt": ["Provider", "Arn"] },
          },
          resources: {
            ProviderRole: {
              Type: "AWS::IAM::Role",
              Properties: {
                RoleName: `provider-${faker.string.uuid()}`,
                AssumeRolePolicyDocument: {
                  Version: "2012-10-17",
                  Statement: [
                    {
                      Effect: "Allow",
                      Principal: { Service: "lambda.amazonaws.com" },
                      Action: "sts:AssumeRole",
                    },
                  ],
                },
              },
            },
            Provider: {
              Type: "AWS::Lambda::Function",
              Properties: {
                Role: { "Fn::GetAtt": ["ProviderRole", "Arn"] },
                Code: { ZipFile: "def handler(event, context): pass" },
                Handler: "index.handler",
                Runtime: "python3.13",
              },
            },
          },
        }),
        caller,
      });
    });

    // Then the refusal names the function ARN real CloudFormation invokes,
    // rather than the stand-in the attribute resolved to.
    assertStringIncludes(error.message, "lambda:InvokeFunction");
    assertStringIncludes(error.message, "arn:aws:lambda:us-east-1:");
    assertStringIncludes(error.message, ":function:");
    assertStringNotIncludes(error.message, "Provider.Arn");
  });

  it("deploys a custom Resource for a deployment naming no caller", async () => {
    // Given a deployment that names no principal, which is decided as the
    // Account root.
    const simAws = new SimAws();
    const stackName = `uploads-${faker.string.uuid()}`;

    // When the Stack is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName,
      template: simCdkBucketNotificationsTemplateFactory.make({}),
    });

    // Then nothing new is asked of it.
    const resource = stack.getResource("BucketNotifications");
    assertNonNullable(resource);
    assertIdentical(resource.status, "CREATE_COMPLETE");
  });
});
