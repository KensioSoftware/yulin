/**
 * The parts a Firehose Kinesis source test needs before it can say anything
 * about what lands in a Bucket: a stream to read, a Role allowed to read it,
 * and a delivery stream reading the one as the other into a Bucket it can
 * write.
 *
 * Each of those is an entity factory of its own, and the delivery half is
 * already put together by `makeFirehoseDelivery`. This is where the source is
 * put on top, because a delivery stream whose stream is absent reads nothing
 * and no test wants that as its Given.
 */

import { assertDefined } from "../../src/util/type-guard/defined.js";
import type { SimAws } from "../../src/service/aws/sim-aws.js";
import { simIamRoleWithPolicyFactory } from "../../src/service/iam/role/sim-iam-role-with-policy.factory.js";
import { simKinesisStreamFactory } from "../../src/service/kinesis/stream/sim-kinesis-stream.factory.js";
import { simFirehoseDeliveryStreamFactory } from "../../src/service/firehose/stream/sim-firehose-delivery-stream.factory.js";
import type { SimFirehoseDeliveryStream } from "../../src/service/firehose/stream/sim-firehose-delivery-stream.js";
import { makeFirehoseDeliveryDestination } from "./firehose-delivery-fixture.js";

/**
 * The Kinesis actions real Firehose requires a source Role to be allowed
 * before it will read a stream.
 */
export const firehoseSourceActions: readonly string[] = [
  "kinesis:DescribeStream",
  "kinesis:GetRecords",
  "kinesis:GetShardIterator",
  "kinesis:ListShards",
];

/**
 * What a Kinesis source fixture leaves a test holding.
 */
export interface FirehoseKinesisSource {
  readonly deliveryStream: SimFirehoseDeliveryStream;
  readonly streamName: string;
  readonly streamArn: string;
  readonly bucketName: string;
  readonly sourceRoleArn: string;
}

interface FirehoseKinesisSourceOptions {
  readonly streamName?: string;
  readonly shardCount?: number;
  readonly intervalInSeconds?: number;
  readonly sourceActions?: readonly string[];
}

/**
 * Make a stream, a source Role and a delivery stream reading the one as the
 * other into an Object destination that works.
 *
 * The Role is allowed the actions real Firehose asks a source Role for.
 * Narrowing them is how a test checks what a Role that cannot read does.
 */
export async function makeFirehoseKinesisSource(
  simAws: SimAws,
  options: FirehoseKinesisSourceOptions = {},
): Promise<FirehoseKinesisSource> {
  const streamName = options.streamName ?? "orders";
  const stream = await simKinesisStreamFactory.make(
    { streamName, shardCount: options.shardCount ?? 1 },
    simAws,
  );

  const role = await simIamRoleWithPolicyFactory.make(
    {
      roleName: "OrderStreamSourceRole",
      policyName: "ReadOrders",
      actions: options.sourceActions ?? firehoseSourceActions,
      resource: stream.arn,
    },
    simAws,
  );

  assertDefined(role.Arn, "Simulated IAM created a Role with no ARN");

  const { bucketName, roleArn } = await makeFirehoseDeliveryDestination(simAws);

  const deliveryStream = await simFirehoseDeliveryStreamFactory.make(
    {
      bucketName,
      roleArn,
      sourceStreamArn: stream.arn,
      sourceRoleArn: role.Arn,
      ...(options.intervalInSeconds !== undefined && {
        intervalInSeconds: options.intervalInSeconds,
      }),
    },
    simAws,
  );

  return {
    deliveryStream,
    streamName,
    streamArn: stream.arn,
    bucketName,
    sourceRoleArn: role.Arn,
  };
}
