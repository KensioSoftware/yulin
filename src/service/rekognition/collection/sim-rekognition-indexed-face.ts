import type {
  SimRekognitionFaceOutput,
  SimRekognitionFaceRecordOutput,
} from "../command/face/face-output.js";
import type { SimRekognitionFaceAttributes } from "../face/sim-rekognition-face-attributes.js";
import type { SimRekognitionDetectedFace } from "../face/sim-rekognition-detected-face.js";

interface SimRekognitionIndexedFaceProperties {
  readonly faceId: string;
  readonly imageId: string;
  readonly externalImageId: string | undefined;
  readonly faceModelVersion: string;
  readonly detected: SimRekognitionDetectedFace;
}

/**
 * One face indexed into a collection.
 *
 * The face it was indexed from is kept rather than a copy of the detail, so
 * the bounding box and confidence a collection reports are the ones the
 * `faces()` rules declared for the image it came from. A face indexed from an
 * image and a face detected in that same image are then the same face.
 */
export class SimRekognitionIndexedFace {
  public readonly faceId: string;
  public readonly externalImageId: string | undefined;

  private readonly imageId: string;
  private readonly faceModelVersion: string;
  private readonly detected: SimRekognitionDetectedFace;

  constructor(properties: SimRekognitionIndexedFaceProperties) {
    this.faceId = properties.faceId;
    this.imageId = properties.imageId;
    this.externalImageId = properties.externalImageId;
    this.faceModelVersion = properties.faceModelVersion;
    this.detected = properties.detected;
  }

  /**
   * This face as a listing or a search match reports it.
   *
   * Real Rekognition keeps a face vector rather than the detail the indexing
   * request asked for, so a face read back this way carries a bounding box
   * and a confidence whatever `DetectionAttributes` the indexing asked for.
   */
  stored(): SimRekognitionFaceOutput {
    const boundingBox = this.detected.boundingBox();

    return {
      FaceId: this.faceId,
      ImageId: this.imageId,
      ...(boundingBox !== undefined && { BoundingBox: boundingBox }),
      ...(this.externalImageId !== undefined && {
        ExternalImageId: this.externalImageId,
      }),
      Confidence: this.detected.confidence(),
      IndexFacesModelVersion: this.faceModelVersion,
    };
  }

  /**
   * This face as the indexing that stored it reports it, with the detail that
   * request asked for.
   */
  record(
    attributes: SimRekognitionFaceAttributes,
  ): SimRekognitionFaceRecordOutput {
    return {
      Face: this.stored(),
      FaceDetail: this.detected.detailFor(attributes),
    };
  }
}
