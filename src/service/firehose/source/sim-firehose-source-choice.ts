import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import {
  SimFirehoseInvalidArgumentException,
  SimFirehoseUnsimulatedSource,
} from "../error/sim-firehose.error.js";
import { SimFirehoseKinesisSourceArn } from "./sim-firehose-kinesis-source-arn.js";
import {
  SimFirehoseDirectPutSource,
  SimFirehoseKinesisSource,
  type SimFirehoseSource,
} from "./sim-firehose-source.js";

/**
 * The Kinesis stream a CreateDeliveryStream request reads from.
 */
export interface SimFirehoseKinesisSourceInput {
  readonly KinesisStreamARN?: string | undefined;
  readonly RoleARN?: string | undefined;
}

/**
 * The source fields a CreateDeliveryStream request can carry.
 */
export interface SimFirehoseSourceInput {
  readonly DeliveryStreamType?: string | undefined;
  readonly KinesisStreamSourceConfiguration?:
    | SimFirehoseKinesisSourceInput
    | undefined;
}

/**
 * The source a request declared, or a refusal saying why there is none.
 *
 * An omitted `DeliveryStreamType` is `DirectPut`, as it is on real Firehose. A
 * type outside the two simulated is refused by name rather than taken as
 * `DirectPut`, since a delivery stream reading an MSK cluster or a database
 * would take nothing and deliver nothing.
 */
export function simFirehoseSourceOf(
  input: SimFirehoseSourceInput,
  scope: SimAwsAccountRegionScope,
  startedAt: Date,
): SimFirehoseSource {
  const type = input.DeliveryStreamType ?? "DirectPut";

  if (type === "KinesisStreamAsSource") {
    return kinesisSource(requiredSourceConfiguration(input), scope, startedAt);
  }

  if (type !== "DirectPut") {
    throw new SimFirehoseUnsimulatedSource(
      `Simulated Kinesis Data Firehose takes records through PutRecord and ` +
        `PutRecordBatch, or reads them off a simulated Kinesis stream, and ` +
        `this delivery stream declares a DeliveryStreamType of ${type}.`,
    );
  }

  if (input.KinesisStreamSourceConfiguration !== undefined) {
    throw new SimFirehoseInvalidArgumentException(
      "A KinesisStreamSourceConfiguration goes with a DeliveryStreamType of " +
        "KinesisStreamAsSource, and this delivery stream is DirectPut",
    );
  }

  return new SimFirehoseDirectPutSource();
}

/**
 * The configuration a Kinesis-sourced delivery stream has to carry.
 */
function requiredSourceConfiguration(
  input: SimFirehoseSourceInput,
): SimFirehoseKinesisSourceInput {
  const configuration = input.KinesisStreamSourceConfiguration;

  if (configuration === undefined) {
    throw new SimFirehoseInvalidArgumentException(
      "A delivery stream of type KinesisStreamAsSource has to declare the " +
        "stream it reads in a KinesisStreamSourceConfiguration",
    );
  }

  return configuration;
}

/**
 * The Kinesis stream a delivery stream reads, and the Role it reads as.
 *
 * A stream in another Account or Region is refused. This simulated Firehose
 * reads the simulated Kinesis of its own scope, and treating a foreign ARN as
 * local would let a test pass while the real delivery stream read nothing.
 */
function kinesisSource(
  configuration: SimFirehoseKinesisSourceInput,
  scope: SimAwsAccountRegionScope,
  startedAt: Date,
): SimFirehoseKinesisSource {
  const streamArn = SimFirehoseKinesisSourceArn.of(
    configuration.KinesisStreamARN,
  );

  if (!streamArn.isIn(scope)) {
    throw new SimFirehoseUnsimulatedSource(
      `Simulated Kinesis Data Firehose reads a source stream in its own ` +
        `account and region, which is ${scope.accountId} in ` +
        `${scope.regionName}, and ${streamArn.value} names another.`,
    );
  }

  return new SimFirehoseKinesisSource({
    streamArn,
    roleArn: requiredRoleArn(configuration.RoleARN),
    startedAt,
  });
}

/**
 * The Role a Kinesis-sourced delivery stream reads as.
 */
function requiredRoleArn(value: string | undefined): string {
  if (value === undefined || value === "") {
    throw new SimFirehoseInvalidArgumentException(
      "The KinesisStreamSourceConfiguration is missing RoleARN",
    );
  }

  return value;
}
