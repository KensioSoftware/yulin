import { SimS3Error } from "./sim-s3.error.js";

/**
 * Simulated S3 checksum mismatch error.
 *
 * Real S3 answers with this when an upload's bytes do not hash to the checksum
 * the request stated. It is worth simulating because of a trap that is easy to
 * fall into and hard to diagnose: the AWS SDK computes a checksum at presigning
 * time, when the body is still empty, and hoists it into the signed URL. An
 * upload through that URL then carries a checksum for no content, and real S3
 * refuses it. A simulator that ignored checksums would pass the test and leave
 * the failure for production.
 */
export class SimS3ChecksumMismatch extends SimS3Error {
  public override readonly name = "XAmzContentChecksumMismatch";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated S3 error for a checksum algorithm the simulator cannot compute.
 *
 * Refusing is the fail-closed answer. Waving the request through would mean
 * storing an Object whose integrity nothing had checked, and reporting success
 * for an upload real S3 might well have rejected.
 */
export class SimS3UnsupportedChecksum extends SimS3Error {
  public override readonly name = "InvalidRequest";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}
