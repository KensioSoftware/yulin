import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimFirehoseDeliveryStream } from "../stream/sim-firehose-delivery-stream.js";
import {
  SimFirehoseDeliveryFailure,
  type SimFirehoseDeliveryFailures,
} from "./sim-firehose-delivery-failures.js";
import { simFirehoseObjectKey } from "./sim-firehose-object-key.js";

/**
 * The narrow slice of simulated S3 that Firehose delivery needs.
 *
 * `SimS3` structurally implements this interface.
 */
export interface SimFirehoseObjectDestination {
  putObject(
    command: { input: { Bucket: string; Key: string; Body: Uint8Array } },
    options?: { caller: SimAwsCaller },
  ): Promise<unknown>;
}

interface SimFirehoseObjectWriterProperties {
  readonly s3: SimFirehoseObjectDestination;
  readonly failures: SimFirehoseDeliveryFailures;
}

/**
 * Writes one delivery stream's buffer into its destination Bucket.
 *
 * The write goes through the simulated S3 PutObject as the delivery stream's
 * `RoleARN`, so simulated IAM applies to it exactly as `s3:PutObject`
 * authorization applies on real AWS. A role that cannot write to the Bucket
 * fails the delivery here.
 *
 * A failed delivery is recorded and swallowed. Real Firehose has already
 * answered the `PutRecord` that put the record in this buffer, and there is no
 * caller left to raise at.
 */
export class SimFirehoseObjectWriter {
  private readonly s3: SimFirehoseObjectDestination;
  private readonly failures: SimFirehoseDeliveryFailures;

  constructor(properties: SimFirehoseObjectWriterProperties) {
    this.s3 = properties.s3;
    this.failures = properties.failures;
  }

  /**
   * Write whatever a delivery stream is holding, under a key stamped with the
   * instant it was delivered.
   *
   * An empty buffer is nothing to write. Real Firehose delivers no Object for
   * an interval in which no record arrived.
   */
  async write(
    deliveryStream: SimFirehoseDeliveryStream,
    deliveredAt: Date,
  ): Promise<void> {
    if (deliveryStream.buffer.isEmpty) {
      return;
    }

    const { destination, name } = deliveryStream;
    const recordCount = deliveryStream.buffer.recordCount;
    const body = deliveryStream.buffer.take();
    const key = simFirehoseObjectKey({
      prefix: destination.prefix,
      deliveryStreamName: name,
      versionId: deliveryStream.versionId,
      deliveredAt,
    });

    try {
      await this.s3.putObject(
        { input: { Bucket: destination.bucketName, Key: key, Body: body } },
        { caller: { kind: "arn", arn: destination.roleArn } },
      );
    } catch (error) {
      this.failures.record(
        new SimFirehoseDeliveryFailure({
          deliveryStreamName: name,
          bucketName: destination.bucketName,
          objectKey: key,
          recordCount,
          roleArn: destination.roleArn,
          error,
        }),
      );
    }
  }
}
