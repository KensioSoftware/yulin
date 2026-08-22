import { SimIamAccessDenied } from "../../iam/error/sim-iam.error.js";

interface SimFirehoseDeliveryFailureProperties {
  readonly deliveryStreamName: string;
  readonly bucketName: string;
  readonly objectKey: string;
  readonly recordCount: number;
  readonly roleArn: string;
  readonly error: unknown;
}

/**
 * One buffer a delivery stream could not write.
 */
export class SimFirehoseDeliveryFailure {
  public readonly deliveryStreamName: string;
  public readonly bucketName: string;
  public readonly objectKey: string;
  public readonly recordCount: number;
  public readonly roleArn: string;
  public readonly error: unknown;

  constructor(properties: SimFirehoseDeliveryFailureProperties) {
    this.deliveryStreamName = properties.deliveryStreamName;
    this.bucketName = properties.bucketName;
    this.objectKey = properties.objectKey;
    this.recordCount = properties.recordCount;
    this.roleArn = properties.roleArn;
    this.error = properties.error;
  }

  /**
   * Whether IAM refused the write rather than the write going wrong.
   */
  get wasRefused(): boolean {
    return this.error instanceof SimIamAccessDenied;
  }

  /**
   * What went wrong, in one line.
   */
  get reason(): string {
    return this.error instanceof Error
      ? this.error.message
      : String(this.error);
  }
}

/**
 * What became of the buffers a simulated Firehose scope could not deliver.
 *
 * Real Firehose answers a `PutRecord` long before the buffer that record joined
 * is delivered. A delivery that fails minutes later reaches the producer
 * through CloudWatch and the error output prefix, and neither of those is
 * simulated. Every failure is kept here for a test to read.
 *
 * A refusal is warned about, and an IAM denial is recorded quietly. Removing
 * `s3:PutObject` from the delivery role is what a test checking the denial
 * does, and that test should not have to read a warning about the thing it
 * asked for. Compare SimS3NotificationFailures, which draws the same line for
 * the same reason.
 */
export class SimFirehoseDeliveryFailures {
  private readonly failures: SimFirehoseDeliveryFailure[] = [];
  private readonly warned = new Set<string>();

  /**
   * Every buffer this scope could not deliver, oldest first.
   */
  get all(): readonly SimFirehoseDeliveryFailure[] {
    return this.failures;
  }

  /**
   * Record a buffer that did not reach its Bucket.
   */
  record(failure: SimFirehoseDeliveryFailure): void {
    this.failures.push(failure);

    if (failure.wasRefused) {
      return;
    }

    this.warn(failure);
  }

  /**
   * Warn about a delivery that failed, once per delivery stream and cause.
   *
   * Warnings go to the console because that is where a test runner surfaces
   * them next to the failing expectation they explain. The simulator has no
   * logger of its own to route them through.
   */
  private warn(failure: SimFirehoseDeliveryFailure): void {
    const key = `${failure.deliveryStreamName}:${failure.reason}`;

    if (this.warned.has(key)) {
      return;
    }

    this.warned.add(key);

    // oxlint-disable-next-line no-console
    console.warn(
      `Simulated Kinesis Data Firehose delivery stream ` +
        `${failure.deliveryStreamName} could not write to ` +
        `s3://${failure.bucketName}/${failure.objectKey}: ${failure.reason}`,
    );
  }
}
