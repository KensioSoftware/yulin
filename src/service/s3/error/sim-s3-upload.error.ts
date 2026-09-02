import { SimS3Error } from "./sim-s3.error.js";

/**
 * The errors a multipart upload answers with.
 *
 * An upload is the one S3 operation made of several requests, so these are
 * about the upload as a whole rather than about one Object or one Bucket.
 */

/**
 * Simulated S3 NoSuchUpload error.
 *
 * What real S3 answers when a request names a multipart upload id it did not
 * issue, or one belonging to an upload that has since been completed or
 * aborted.
 */
export class SimS3NoSuchUpload extends SimS3Error {
  public override readonly name = "NoSuchUpload";

  constructor(message: string) {
    super(message, { httpStatusCode: 404 });
  }
}

/**
 * Simulated S3 InvalidPart error.
 *
 * A completion naming a part that was never uploaded, or naming an ETag other
 * than the one that part was stored under. Real S3 refuses rather than
 * assembling what it can, because a caller that lost a part should not end up
 * with an Object silently missing its middle.
 */
export class SimS3InvalidPart extends SimS3Error {
  public override readonly name = "InvalidPart";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated S3 InvalidPartOrder error.
 *
 * A completion listing its parts in an order other than ascending part number.
 * The parts themselves can be uploaded in any order; it is the list in the
 * completion request that real S3 requires to be sorted.
 */
export class SimS3InvalidPartOrder extends SimS3Error {
  public override readonly name = "InvalidPartOrder";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}
