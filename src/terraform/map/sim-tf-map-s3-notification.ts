/*
 * Where a bucket sends its events, which the provider declares as a resource
 * of its own.
 */
import {
  attribute,
  blocks,
  field,
  properties,
  type TerraformMappingContext,
} from "../sim-tf-attributes.js";
import type { TerraformMappedResource } from "../sim-tf-mapping.type.js";
import { blockAttribute } from "../sim-tf-nested-attributes.js";
import { notificationConfiguration } from "./sim-tf-map-s3-notification-destinations.js";

/**
 * The three destination blocks, and what the request calls each of them.
 *
 * `destination` is the Terraform attribute holding the ARN, and `arn` is the
 * key it is written under, which repeats the service's name on all three.
 */
export const notificationDestinations = [
  {
    block: "lambda_function",
    destination: "lambda_function_arn",
    property: "LambdaFunctionConfigurations",
    arn: "LambdaFunctionArn",
  },
  {
    block: "queue",
    destination: "queue_arn",
    property: "QueueConfigurations",
    arn: "QueueArn",
  },
  {
    block: "topic",
    destination: "topic_arn",
    property: "TopicConfigurations",
    arn: "TopicArn",
  },
] as const;

export interface NotificationDestination {
  readonly block: string;
  readonly destination: string;
  readonly property: string;
  readonly arn: string;
}

/**
 * The notification configuration a bucket is deployed with.
 *
 * This is a Resource of its own rather than a bucket property, for the reason
 * CDK gives it one as well. A function's `AWS::Lambda::Permission` names the
 * bucket whose events it admits, so a bucket naming the function back is a
 * circular dependency CloudFormation refuses. Terraform declares the same three
 * resources and has no cycle, because the notification sits between them, and
 * `Custom::S3BucketNotifications` is that resource here. Simulated
 * CloudFormation applies one with a single
 * PutBucketNotificationConfiguration call, after everything the plan declared
 * it to come after.
 *
 * The Resource carries the SDK request shape rather than the CloudFormation
 * one, which is what CDK's own provider function is handed, and it is the
 * closer of the two to what Terraform writes: a list of events per destination
 * rather than one configuration per event.
 */
export function bucketNotification(
  context: TerraformMappingContext,
): TerraformMappedResource {
  return {
    Type: "Custom::S3BucketNotifications",
    Properties: properties({
      BucketName: attribute(context, "bucket"),
      NotificationConfiguration: notificationConfiguration(context),
    }),
    requires: ["BucketName", "NotificationConfiguration"],
    lost: notificationLost(context),
  };
}

/**
 * What the notification configuration could not carry across.
 *
 * A destination whose ARN the plan left unresolvable is dropped, since a
 * configuration naming nothing would raise its events at nothing. EventBridge
 * delivery is dropped too: simulated S3 refuses an `EventBridgeConfiguration`
 * by name rather than accepting one it would never deliver through.
 */
function notificationLost(context: TerraformMappingContext): readonly string[] {
  const dropped = notificationDestinations.filter((destination) =>
    blocks(context, destination.block).some(
      (_, index) =>
        blockAttribute(
          context,
          destination.block,
          index,
          destination.destination,
        ) === undefined,
    ),
  );

  return [
    ...dropped.map((destination) => destination.block),
    ...(field(context.resource.values, "eventbridge") === true
      ? ["eventbridge"]
      : []),
  ];
}
