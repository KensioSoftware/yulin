import { MappedFactory } from "@kensio/part-factory";

import type { CfnTemplateBodyRecord } from "../../../template/sim-cfn-template.js";
import type { SimCfnTemplateValueRecord } from "../../../template/value/sim-cfn-template-value.js";

/**
 * What a test asks for when it wants the template CDK synthesizes for
 * `bucket.addEventNotification(...)`.
 *
 * Four Resources stand between a test and a Bucket that notifies a function,
 * and most tests about the custom Resource are about one property of one of
 * them. `notificationProperties` is merged in last, so a test states the one
 * property it is about rather than the whole template.
 */
export interface SimCdkBucketNotificationsTemplateInput {
  readonly bucketName: string;
  readonly functionName: string;
  /** The inline function code the notification is delivered to. */
  readonly handlerSource: string;
  /** The configuration the custom Resource carries, in the SDK request shape. */
  readonly notificationConfiguration: SimCfnTemplateValueRecord;
  readonly notificationProperties: SimCfnTemplateValueRecord;
  /**
   * Whether the template grants S3 permission to invoke the function, which
   * CDK always does alongside the notification.
   */
  readonly permitted: boolean;
  readonly resources: SimCfnTemplateValueRecord;
}

/**
 * The Resources and the `DependsOn` the permission contributes to the template.
 */
interface SimCdkBucketNotificationsPermission {
  readonly resources: SimCfnTemplateValueRecord;
  readonly dependsOn: SimCfnTemplateValueRecord;
}

const assumeRolePolicyDocument = {
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
 * Builds the template CDK synthesizes for a Bucket event notification.
 *
 * ```typescript
 * const stack = await simAws.cloudFormation().deployTemplate({
 *   stackName: "uploads-stack",
 *   template: simCdkBucketNotificationsTemplateFactory.make({
 *     notificationProperties: { Managed: false },
 *   }),
 * });
 * ```
 *
 * The `ServiceToken` points at nothing, as it does in the tests that matter:
 * CDK's provider function is a Python function this simulator skips, and the
 * factory reads the properties around the token rather than the token itself.
 */
export const simCdkBucketNotificationsTemplateFactory = new MappedFactory<
  SimCdkBucketNotificationsTemplateInput,
  CfnTemplateBodyRecord
>(
  () => ({
    bucketName: "uploads",
    functionName: "thumbnailer",
    handlerSource: "exports.handler = async () => 'thumbnailed';",
    notificationConfiguration: {
      LambdaFunctionConfigurations: [
        {
          Events: ["s3:ObjectCreated:*"],
          LambdaFunctionArn: { "Fn::GetAtt": ["Handler", "Arn"] },
        },
      ],
    },
    notificationProperties: {},
    permitted: true,
    resources: {},
  }),
  (input) => ({
    Resources: {
      Bucket: {
        Type: "AWS::S3::Bucket",
        Properties: { BucketName: input.bucketName },
      },
      HandlerRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: `${input.functionName}-role`,
          AssumeRolePolicyDocument: assumeRolePolicyDocument,
        },
      },
      Handler: {
        Type: "AWS::Lambda::Function",
        Properties: {
          FunctionName: input.functionName,
          Role: { "Fn::GetAtt": ["HandlerRole", "Arn"] },
          Code: { ZipFile: input.handlerSource },
          Handler: "index.handler",
          Runtime: "nodejs20.x",
        },
      },
      ...invokePermission(input).resources,
      BucketNotifications: {
        Type: "Custom::S3BucketNotifications",
        ...invokePermission(input).dependsOn,
        Properties: {
          ServiceToken: "arn:aws:lambda:us-east-1:888888888888:function:cdk",
          BucketName: { Ref: "Bucket" },
          NotificationConfiguration: input.notificationConfiguration,
          Managed: true,
          SkipDestinationValidation: false,
          ...input.notificationProperties,
        },
      },
      ...input.resources,
    },
  }),
);

/**
 * What the template carries for the `AWS::Lambda::Permission` CDK writes beside
 * the notification, letting S3 invoke the function for events from this Bucket.
 *
 * The `DependsOn` comes with it, because it is what CDK writes to have the
 * permission in place before S3 validates the destination naming the function.
 */
function invokePermission(
  input: SimCdkBucketNotificationsTemplateInput,
): SimCdkBucketNotificationsPermission {
  if (!input.permitted) {
    return { resources: {}, dependsOn: {} };
  }

  return {
    dependsOn: { DependsOn: ["HandlerPermission"] },
    resources: {
      HandlerPermission: {
        Type: "AWS::Lambda::Permission",
        Properties: {
          Action: "lambda:InvokeFunction",
          FunctionName: { "Fn::GetAtt": ["Handler", "Arn"] },
          Principal: "s3.amazonaws.com",
          SourceAccount: { Ref: "AWS::AccountId" },
          SourceArn: { "Fn::GetAtt": ["Bucket", "Arn"] },
        },
      },
    },
  };
}
