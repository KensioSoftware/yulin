import type {
  SimRekognitionImageInput,
  SimRekognitionS3ObjectInput,
} from "../command/detect-moderation-labels/detect-moderation-labels.command.js";
import type { SimRekognitionRequestOptions } from "../command/sim-rekognition-request-options.js";
import {
  SimRekognitionInvalidParameterException,
  SimRekognitionUnsimulatedInputException,
} from "../error/sim-rekognition.error.js";
import { SimRekognitionImage } from "./sim-rekognition-image.js";
import type { SimRekognitionImageObjects } from "./sim-rekognition-image-objects.js";

/**
 * The image a detection request named, before it has been read.
 *
 * Parsing the request and reading the image are separate steps because they
 * happen at different points in an operation: the request is checked before
 * anything else, and the image is read only once the caller has been
 * authorized for the detection.
 */
export interface SimRekognitionImageRequest {
  read(
    images: SimRekognitionImageObjects,
    options: SimRekognitionRequestOptions,
  ): Promise<SimRekognitionImage>;
}

/**
 * An image the request carried the bytes of.
 *
 * It has no name, so only a hash rule or the default can match it.
 */
export class SimRekognitionImageBytesRequest implements SimRekognitionImageRequest {
  constructor(private readonly bytes: Uint8Array) {}

  /**
   * Take the bytes the request already carries.
   */
  read(): Promise<SimRekognitionImage> {
    return Promise.resolve(new SimRekognitionImage({ bytes: this.bytes }));
  }
}

/**
 * An image the request named as an S3 object.
 */
export class SimRekognitionImageS3Request implements SimRekognitionImageRequest {
  constructor(
    private readonly bucketName: string,
    private readonly objectName: string,
  ) {}

  /**
   * Read the object, as the caller making the detection request.
   */
  async read(
    images: SimRekognitionImageObjects,
    options: SimRekognitionRequestOptions,
  ): Promise<SimRekognitionImage> {
    const bytes = await images.read({
      bucketName: this.bucketName,
      objectName: this.objectName,
      caller: options.caller,
    });

    return new SimRekognitionImage({ bytes, name: this.objectName });
  }
}

function parseS3Object(
  s3Object: SimRekognitionS3ObjectInput,
): SimRekognitionImageRequest {
  if (s3Object.Version !== undefined) {
    throw new SimRekognitionUnsimulatedInputException(
      "DetectModerationLabels S3Object Version is not simulated: simulated " +
        "S3 has no object versions, so the version would be ignored here and " +
        "applied on real AWS",
    );
  }

  if (s3Object.Bucket === undefined || s3Object.Name === undefined) {
    throw new SimRekognitionInvalidParameterException(
      "Request has invalid parameters: Image S3Object needs both Bucket " +
        "and Name",
    );
  }

  return new SimRekognitionImageS3Request(s3Object.Bucket, s3Object.Name);
}

/**
 * Read the `Image` member of a detection request.
 *
 * Real Rekognition takes exactly one of bytes or an S3 object, so neither and
 * both are equally invalid requests.
 */
export function parseSimRekognitionImageRequest(
  image: SimRekognitionImageInput | undefined,
): SimRekognitionImageRequest {
  if (image === undefined) {
    throw new SimRekognitionInvalidParameterException(
      "Request has invalid parameters: Image is required",
    );
  }

  if (image.Bytes !== undefined && image.S3Object !== undefined) {
    throw new SimRekognitionInvalidParameterException(
      "Request has invalid parameters: Image takes either Bytes or " +
        "S3Object, not both",
    );
  }

  if (image.Bytes !== undefined) {
    return new SimRekognitionImageBytesRequest(image.Bytes);
  }

  if (image.S3Object !== undefined) {
    return parseS3Object(image.S3Object);
  }

  throw new SimRekognitionInvalidParameterException(
    "Request has invalid parameters: Image needs either Bytes or S3Object",
  );
}
