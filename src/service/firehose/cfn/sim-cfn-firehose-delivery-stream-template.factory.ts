import { MappedFactory } from "@kensio/part-factory";

import type { CfnTemplateBodyRecord } from "../../cloudformation/template/sim-cfn-template.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import {
  cdkDeliveryStreamProperties,
  firehoseDeliveryActions,
  orderArchiveBucket,
  orderArchiveDeliveryRole,
  orderSourceRole,
  orderSourceStream,
} from "./sim-cfn-firehose-archive.resources.js";

export {
  cdkKinesisSource,
  cdkS3Destination,
  orderArchiveBucketName,
} from "./sim-cfn-firehose-archive.resources.js";

/**
 * What a test asks for when it wants a stack holding a delivery stream.
 */
export interface SimCfnFirehoseDeliveryStreamTemplateInput {
  /**
   * The Properties the AWS::KinesisFirehose::DeliveryStream Resource carries.
   *
   * Left empty, the delivery stream is the one CDK synthesizes. A test that
   * states them replaces them outright, since the factory merges its defaults
   * into whatever it is given and a default stated here would put back the very
   * property a test about a missing one is leaving out.
   */
  readonly deliveryStreamProperties: SimCfnTemplateValueRecord;

  /**
   * The S3 actions the delivery Role is allowed.
   *
   * Left empty, it is allowed the ones real Firehose asks a delivery Role for.
   * Narrowing them is how a test checks what a Role that cannot write does.
   */
  readonly allowedActions: readonly string[];

  /**
   * The stream a Kinesis-sourced delivery stream reads.
   *
   * Left empty, the stack holds no stream and no source Role, which is what a
   * `DirectPut` delivery stream wants. Naming one adds both, and
   * `cdkKinesisSource` is the configuration that reads them.
   */
  readonly sourceStreamName: string;
}

/**
 * Builds a stack holding a Bucket, a delivery Role and a delivery stream
 * writing into the one as the other.
 *
 * ```typescript
 * const stack = await simAws.cloudFormation().deployTemplate({
 *   stackName: "orders-stack",
 *   template: simCfnFirehoseDeliveryStreamTemplateFactory.make(),
 * });
 * ```
 *
 * The Bucket and the Role are read by ARN through `Fn::GetAtt`, which is what
 * CDK synthesizes, so a deployment that resolved either wrongly delivers
 * nowhere. The Outputs read the delivery stream both ways CloudFormation
 * publishes it.
 */
export const simCfnFirehoseDeliveryStreamTemplateFactory = new MappedFactory<
  SimCfnFirehoseDeliveryStreamTemplateInput,
  CfnTemplateBodyRecord
>(
  () => ({
    deliveryStreamProperties: {},
    allowedActions: [],
    sourceStreamName: "",
  }),
  (input) => ({
    Resources: {
      OrderArchive: orderArchiveBucket,
      DeliveryRole: orderArchiveDeliveryRole(allowedActions(input)),
      ...sourceResources(input),
      OrderEvents: {
        Type: "AWS::KinesisFirehose::DeliveryStream",
        Properties: deliveryStreamProperties(input),
      },
    },
    Outputs: {
      StreamRef: { Value: { Ref: "OrderEvents" } },
      StreamArn: { Value: { "Fn::GetAtt": ["OrderEvents", "Arn"] } },
      RoleArn: { Value: { "Fn::GetAtt": ["DeliveryRole", "Arn"] } },
    },
  }),
);

/**
 * The stream and the Role a Kinesis-sourced delivery stream reads, for a stack
 * that names one.
 */
function sourceResources(
  input: SimCfnFirehoseDeliveryStreamTemplateInput,
): SimCfnTemplateValueRecord {
  if (input.sourceStreamName === "") {
    return {};
  }

  return {
    OrderStream: orderSourceStream(input.sourceStreamName),
    SourceRole: orderSourceRole(),
  };
}

function allowedActions(
  input: SimCfnFirehoseDeliveryStreamTemplateInput,
): readonly string[] {
  if (input.allowedActions.length > 0) {
    return input.allowedActions;
  }

  return firehoseDeliveryActions;
}

function deliveryStreamProperties(
  input: SimCfnFirehoseDeliveryStreamTemplateInput,
): SimCfnTemplateValueRecord {
  if (Object.keys(input.deliveryStreamProperties).length > 0) {
    return input.deliveryStreamProperties;
  }

  return cdkDeliveryStreamProperties;
}
