import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import { SimRekognitionError } from "../error/sim-rekognition.error.js";

/**
 * An S3 object a detection request named, and who is asking for it.
 */
export interface SimRekognitionImageObjectRequest {
  readonly bucketName: string;
  readonly objectName: string;
  readonly caller?: SimAwsCaller | undefined;
}

/**
 * The S3 objects simulated Rekognition can read images from.
 *
 * Rekognition reads the object itself rather than being handed the bytes, so
 * this is the seam where that read happens. The read is made as the caller, so
 * simulated IAM applies to the image object exactly as `s3:GetObject`
 * authorization would on real AWS.
 */
export interface SimRekognitionImageObjects {
  read(request: SimRekognitionImageObjectRequest): Promise<Uint8Array>;
}

/**
 * The image objects of a simulated Rekognition built without simulated S3.
 *
 * A standalone SimRekognition has no S3 to read from, so an `Image.S3Object`
 * request says so rather than failing as though the object were missing.
 * Passing the bytes as `Image.Bytes` still works, and reaching Rekognition
 * through SimAws is what connects the two services.
 */
export class SimRekognitionUnreachableImageObjects implements SimRekognitionImageObjects {
  /**
   * Refuse the read, naming the object that cannot be reached.
   */
  read(request: SimRekognitionImageObjectRequest): Promise<Uint8Array> {
    throw new SimRekognitionError(
      `Simulated Rekognition cannot read ` +
        `s3://${request.bucketName}/${request.objectName} because it was ` +
        `built without simulated S3. Reach Rekognition through SimAws to ` +
        `detect on an Image.S3Object, or pass the image as Image.Bytes.`,
    );
  }
}
