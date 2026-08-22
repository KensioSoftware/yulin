import { AsyncMappedFactory } from "@kensio/part-factory";
import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimAws } from "../../aws/sim-aws.js";
import type { SimFirehoseDeliveryStream } from "./sim-firehose-delivery-stream.js";

/**
 * What a test asks for when it wants a delivery stream to put records onto.
 *
 * The Bucket has to be there already, since a delivery stream is one entity and
 * its destination is another. `test/firehose/firehose-delivery-fixture.ts`
 * makes both together for the tests that want the whole path.
 */
export interface SimFirehoseDeliveryStreamInput {
  readonly deliveryStreamName: string;
  readonly bucketName: string;
  readonly prefix: string;
  readonly intervalInSeconds: number;
  readonly sizeInMegabytes: number;

  /**
   * The Role the delivery writes as.
   *
   * A delivery stream made without one writes as the Account root, which IAM
   * allows everything. A test about the delivery Role passes one from
   * `simIamRoleWithPolicyFactory`.
   */
  readonly roleArn: string | undefined;

  /**
   * The Kinesis stream the delivery stream reads, for the tests that want one.
   *
   * A delivery stream made without it is `DirectPut`, which is what most tests
   * want. Naming a stream makes it `KinesisStreamAsSource`, and the stream has
   * to be there already: it is one entity and the delivery stream is another.
   */
  readonly sourceStreamArn: string | undefined;

  /**
   * The Role the source stream is read as, which the Account root stands in
   * for when a test is not about the source Role.
   */
  readonly sourceRoleArn: string | undefined;
}

/**
 * Creates a delivery stream through CreateDeliveryStream.
 *
 * The delivery stream went through the ordinary command, so it is the delivery
 * stream an application would have rather than one built around the commands,
 * and it is ACTIVE by the time this answers.
 *
 * ```typescript
 * const deliveryStream = await simFirehoseDeliveryStreamFactory.make(
 *   { bucketName: "order-archive", intervalInSeconds: 60 },
 *   simAws,
 * );
 * ```
 *
 * A delivery stream reading a Kinesis stream is the same call naming the
 * stream, which has to be there already.
 */
export const simFirehoseDeliveryStreamFactory = new AsyncMappedFactory<
  SimFirehoseDeliveryStreamInput,
  SimFirehoseDeliveryStream,
  SimAws
>(
  () => ({
    deliveryStreamName: "order-events",
    bucketName: "order-archive",
    prefix: "",
    intervalInSeconds: 60,
    sizeInMegabytes: 5,
    roleArn: undefined,
    sourceStreamArn: undefined,
    sourceRoleArn: undefined,
  }),
  async (input, simAws) => {
    const firehose = simAws.firehose();
    const accountRoot = `arn:aws:iam::${simAws.defaultAccountId}:root`;

    await firehose.createDeliveryStream({
      input: {
        DeliveryStreamName: input.deliveryStreamName,
        ...(input.sourceStreamArn !== undefined && {
          DeliveryStreamType: "KinesisStreamAsSource",
          KinesisStreamSourceConfiguration: {
            KinesisStreamARN: input.sourceStreamArn,
            RoleARN: input.sourceRoleArn ?? accountRoot,
          },
        }),
        ExtendedS3DestinationConfiguration: {
          BucketARN: `arn:aws:s3:::${input.bucketName}`,
          RoleARN: input.roleArn ?? accountRoot,
          Prefix: input.prefix,
          BufferingHints: {
            IntervalInSeconds: input.intervalInSeconds,
            SizeInMBs: input.sizeInMegabytes,
          },
        },
      },
    });

    // A name CreateDeliveryStream accepted is a delivery stream the store
    // holds, so this is only missing if something is wrong with the simulator
    // itself.
    const deliveryStream = firehose.findDeliveryStream(
      input.deliveryStreamName,
    );
    assertDefined(
      deliveryStream,
      `Simulated Firehose created the delivery stream ` +
        `${input.deliveryStreamName} and then did not hold it`,
    );

    return deliveryStream;
  },
);
