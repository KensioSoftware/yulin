import { SimIamAccessDenied } from "../../iam/error/sim-iam.error.js";

interface SimFirehoseFailureProperties {
  readonly deliveryStreamName: string;
  readonly roleArn: string;
  readonly error: unknown;
}

/**
 * Something a delivery stream could not do, kept where a test can read it.
 *
 * A delivery stream works out of sight of the caller. Real Firehose answered
 * the producer minutes before it wrote the buffer that record joined, and it
 * reads its source stream with no caller in front of it at all. What went wrong
 * reaches a real operator through CloudWatch, which is not simulated, so it is
 * kept on the simulator instead.
 *
 * The Role is on every failure because it is the usual cause: the delivery
 * Role that cannot write to the Bucket, or the source Role that cannot read the
 * stream.
 */
export abstract class SimFirehoseFailure {
  public readonly deliveryStreamName: string;
  public readonly roleArn: string;
  public readonly error: unknown;

  constructor(properties: SimFirehoseFailureProperties) {
    this.deliveryStreamName = properties.deliveryStreamName;
    this.roleArn = properties.roleArn;
    this.error = properties.error;
  }

  /**
   * Whether IAM refused this rather than it going wrong.
   */
  get wasRefused(): boolean {
    return this.error instanceof SimIamAccessDenied;
  }

  /**
   * What went wrong, in one line.
   */
  get reason(): string {
    if (this.error instanceof Error) {
      return this.error.message;
    }

    return String(this.error);
  }

  /**
   * How this failure reads on the console, for the ones worth warning about.
   */
  abstract get warning(): string;
}
