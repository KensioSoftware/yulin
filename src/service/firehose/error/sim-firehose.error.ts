/**
 * Minimal metadata shape for simulated Firehose errors.
 */
export interface SimFirehoseErrorMetadata {
  readonly httpStatusCode?: number;
}

/**
 * Base class for simulated Kinesis Data Firehose errors.
 */
export class SimFirehoseError extends Error {
  constructor(
    message: string,
    public readonly $metadata: SimFirehoseErrorMetadata = {},
  ) {
    super(message);
  }
}

/**
 * Simulated Firehose InvalidArgumentException error.
 *
 * Real Firehose reports a malformed request this way: a delivery stream name it
 * will not accept, a record over the size limit, a batch over the record count,
 * or buffering hints outside the range it allows.
 */
export class SimFirehoseInvalidArgumentException extends SimFirehoseError {
  public override readonly name = "InvalidArgumentException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated Firehose ResourceNotFoundException error.
 *
 * Real Firehose reports a delivery stream it does not hold this way, whichever
 * operation asked for it.
 */
export class SimFirehoseResourceNotFoundException extends SimFirehoseError {
  public override readonly name = "ResourceNotFoundException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated Firehose ResourceInUseException error.
 *
 * Real Firehose refuses a second delivery stream under a name it already holds.
 */
export class SimFirehoseResourceInUseException extends SimFirehoseError {
  public override readonly name = "ResourceInUseException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated Firehose UnsimulatedDestination error.
 *
 * This has no counterpart on real Firehose. Yulin simulates the S3 destination
 * and refuses the rest by name at CreateDeliveryStream, where a test can see
 * which destination it asked for. A delivery stream created against Redshift or
 * OpenSearch would take records and drop them, and a test asserting on an
 * empty bucket would blame the code under test.
 */
export class SimFirehoseUnsimulatedDestination extends SimFirehoseError {
  public override readonly name = "SimFirehoseUnsimulatedDestination";

  constructor(destination: string) {
    super(
      `Simulated Kinesis Data Firehose delivers to S3 only, and this delivery ` +
        `stream declares ${destination}. Declare an ` +
        `ExtendedS3DestinationConfiguration instead, or leave this delivery ` +
        `stream out of the simulation.`,
      { httpStatusCode: 400 },
    );
  }
}

/**
 * Simulated Firehose UnsimulatedSource error.
 *
 * This has no counterpart on real Firehose. `DirectPut` is the only source
 * simulated, and a delivery stream reading from a Kinesis stream would take
 * nothing and deliver nothing. Refusing at CreateDeliveryStream says so where
 * the request that asked for it is.
 */
export class SimFirehoseUnsimulatedSource extends SimFirehoseError {
  public override readonly name = "SimFirehoseUnsimulatedSource";

  constructor() {
    super(
      "Simulated Kinesis Data Firehose takes records through PutRecord and " +
        "PutRecordBatch only. A delivery stream reading from a Kinesis " +
        "stream is not simulated, so leave DeliveryStreamType at DirectPut " +
        "and put the records the delivery stream should see.",
      { httpStatusCode: 400 },
    );
  }
}
