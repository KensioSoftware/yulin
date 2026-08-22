/**
 * The parts a Firehose delivery test needs before it can say anything about
 * what lands in a Bucket: a destination Bucket, a Role allowed to write to it,
 * and a delivery stream pointing at both.
 *
 * Each of the three is an entity factory of its own. This is where they are put
 * together, because a delivery stream whose Bucket is absent delivers nothing
 * and no test wants that as its Given.
 */

import {
  CreateBucketCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { assertNonNullable } from "@kensio/smartass";
import { assertDefined } from "../../src/util/type-guard/defined.js";
import { simS3BodyToBuffer } from "../../src/service/s3/storage/s3-body-buffer.js";
import type { SimAws } from "../../src/service/aws/sim-aws.js";
import { simIamRoleWithPolicyFactory } from "../../src/service/iam/role/sim-iam-role-with-policy.factory.js";
import { simFirehoseDeliveryStreamFactory } from "../../src/service/firehose/stream/sim-firehose-delivery-stream.factory.js";
import type { SimFirehoseDeliveryStream } from "../../src/service/firehose/stream/sim-firehose-delivery-stream.js";

/**
 * The S3 action real Firehose requires a delivery Role to be allowed before it
 * will write a buffer.
 */
export const firehoseDeliveryActions: readonly string[] = [
  "s3:AbortMultipartUpload",
  "s3:GetBucketLocation",
  "s3:GetObject",
  "s3:ListBucket",
  "s3:ListBucketMultipartUploads",
  "s3:PutObject",
];

/**
 * A Bucket and a Role allowed to write into it, which is what a delivery
 * stream needs before it can deliver anything.
 */
export interface FirehoseDeliveryDestination {
  readonly bucketName: string;
  readonly roleArn: string;
}

/**
 * What a delivery fixture leaves a test holding.
 */
export interface FirehoseDelivery extends FirehoseDeliveryDestination {
  readonly deliveryStream: SimFirehoseDeliveryStream;
}

interface FirehoseDeliveryOptions {
  readonly bucketName?: string;
  readonly prefix?: string;
  readonly intervalInSeconds?: number;
  readonly sizeInMegabytes?: number;
  readonly actions?: readonly string[];
}

/**
 * Make a Bucket and a delivery Role allowed to write into it.
 *
 * The Role is allowed the actions real Firehose asks a delivery Role for.
 * Narrowing them is how a test checks what a Role that cannot write does.
 *
 * This is the half a delivery stream reading a Kinesis stream needs as well,
 * which is why it is on its own.
 */
export async function makeFirehoseDeliveryDestination(
  simAws: SimAws,
  options: FirehoseDeliveryOptions = {},
): Promise<FirehoseDeliveryDestination> {
  const bucketName = options.bucketName ?? "order-archive";

  await simAws
    .s3()
    .createBucket(new CreateBucketCommand({ Bucket: bucketName }));

  const role = await simIamRoleWithPolicyFactory.make(
    {
      roleName: "OrderArchiveDeliveryRole",
      policyName: "ArchiveOrders",
      actions: options.actions ?? firehoseDeliveryActions,
      resource: `arn:aws:s3:::${bucketName}/*`,
    },
    simAws,
  );

  assertDefined(role.Arn, "Simulated IAM created a Role with no ARN");

  return { bucketName, roleArn: role.Arn };
}

/**
 * Make a Bucket, a delivery Role and a delivery stream writing into the one as
 * the other.
 */
export async function makeFirehoseDelivery(
  simAws: SimAws,
  options: FirehoseDeliveryOptions = {},
): Promise<FirehoseDelivery> {
  const { bucketName, roleArn } = await makeFirehoseDeliveryDestination(
    simAws,
    options,
  );

  const deliveryStream = await simFirehoseDeliveryStreamFactory.make(
    {
      bucketName,
      roleArn,
      prefix: options.prefix ?? "",
      intervalInSeconds: options.intervalInSeconds ?? 60,
      sizeInMegabytes: options.sizeInMegabytes ?? 5,
    },
    simAws,
  );

  return { deliveryStream, bucketName, roleArn };
}

/**
 * Every Object key in a Bucket, in the order S3 lists them.
 */
export async function deliveredObjectKeys(
  simAws: SimAws,
  bucketName: string,
): Promise<readonly string[]> {
  const listing = await simAws
    .s3()
    .listObjectsV2(new ListObjectsV2Command({ Bucket: bucketName }));

  return (listing.Contents ?? []).map((object) => object.Key ?? "");
}

/**
 * The bytes of one delivered Object, as text.
 */
export async function deliveredObjectBody(
  simAws: SimAws,
  bucketName: string,
  key: string | undefined,
): Promise<string> {
  assertDefined(key, "A delivered Object was expected under a key");

  const read = await simAws
    .s3()
    .getObject(new GetObjectCommand({ Bucket: bucketName, Key: key }));

  assertNonNullable(read.Body, `The Object at ${key} has a body`);

  const bytes = await simS3BodyToBuffer(read.Body);

  return bytes.toString("utf8");
}
