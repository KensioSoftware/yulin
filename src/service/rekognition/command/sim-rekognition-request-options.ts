import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";

/**
 * The request context a simulated Rekognition operation is made in.
 */
export interface SimRekognitionRequestOptions {
  /**
   * The principal making the request. Defaults to the Account root.
   *
   * It is authorized for the Rekognition action, and it is also the principal
   * the image is read from S3 as, so a caller allowed to detect but not
   * allowed `s3:GetObject` on the image is refused the way it would be on real
   * AWS.
   */
  readonly caller?: SimAwsCaller | undefined;
}
