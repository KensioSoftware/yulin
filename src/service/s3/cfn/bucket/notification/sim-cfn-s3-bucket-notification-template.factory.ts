import { MappedFactory } from "@kensio/part-factory";

import type { CfnTemplateBodyRecord } from "../../../../cloudformation/template/sim-cfn-template.js";
import type { SimCfnTemplateValueRecord } from "../../../../cloudformation/template/value/sim-cfn-template-value.js";
import {
  handler,
  handlerArn,
  handlerPermission,
  handlerRole,
} from "./sim-cfn-s3-bucket-notification-handler.resources.js";

/**
 * What a test asks for when it wants a template configuring Bucket event
 * notifications through the AWS::S3::Bucket NotificationConfiguration property.
 */
export interface SimCfnS3BucketNotificationTemplateInput {
  /**
   * The configuration the Bucket carries, in the CloudFormation shape.
   *
   * Left empty, the Bucket gets a working Lambda notification. A test that
   * states one replaces it outright, which is what a test about a configuration
   * the reader refuses needs: the factory merges its defaults into whatever it
   * is given, so a default stated here would put back the very property the
   * test is about leaving out.
   */
  readonly notificationConfiguration: SimCfnTemplateValueRecord;
  /**
   * Whether the template grants S3 permission to invoke the function, which S3
   * checks as the configuration is applied.
   */
  readonly permitted: boolean;
}

const workingConfiguration: SimCfnTemplateValueRecord = {
  LambdaConfigurations: [{ Event: "s3:ObjectCreated:*", Function: handlerArn }],
};

/**
 * Builds a template configuring Bucket event notifications from an
 * AWS::S3::Bucket Resource.
 *
 * ```typescript
 * const stack = await simAws.cloudFormation().deployTemplate({
 *   stackName: "uploads-stack",
 *   template: simCfnS3BucketNotificationTemplateFactory.make({
 *     notificationConfiguration: { LambdaConfigurations: [] },
 *   }),
 * });
 * ```
 *
 * The Bucket names itself rather than letting CloudFormation name it, which is
 * what a real template does here so the permission can name it by ARN literal.
 * The `DependsOn` puts the permission in place before S3 validates the
 * destination.
 */
export const simCfnS3BucketNotificationTemplateFactory = new MappedFactory<
  SimCfnS3BucketNotificationTemplateInput,
  CfnTemplateBodyRecord
>(
  () => ({ notificationConfiguration: {}, permitted: true }),
  (input) => ({
    Resources: {
      HandlerRole: handlerRole,
      Handler: handler,
      ...invokePermission(input),
      Bucket: {
        Type: "AWS::S3::Bucket",
        ...dependsOnPermission(input),
        Properties: {
          BucketName: "uploads",
          NotificationConfiguration: notificationConfiguration(input),
        },
      },
    },
  }),
);

/**
 * The permission Resource, for a template that grants one.
 */
function invokePermission(
  input: SimCfnS3BucketNotificationTemplateInput,
): SimCfnTemplateValueRecord {
  if (!input.permitted) {
    return {};
  }

  return { HandlerPermission: handlerPermission };
}

/**
 * The `DependsOn` the Bucket carries.
 */
function dependsOnPermission(
  input: SimCfnS3BucketNotificationTemplateInput,
): SimCfnTemplateValueRecord {
  if (!input.permitted) {
    return {};
  }

  return { DependsOn: ["HandlerPermission"] };
}

/**
 * The configuration the Bucket carries, which is a working Lambda notification
 * for a test that states none of its own.
 */
function notificationConfiguration(
  input: SimCfnS3BucketNotificationTemplateInput,
): SimCfnTemplateValueRecord {
  if (Object.keys(input.notificationConfiguration).length > 0) {
    return input.notificationConfiguration;
  }

  return workingConfiguration;
}
