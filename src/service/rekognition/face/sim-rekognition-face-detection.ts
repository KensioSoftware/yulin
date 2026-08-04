import type { SimRekognitionFaceDetailOutput } from "../command/detect-faces/detect-faces.command.js";
import { SimRekognitionDeclarationError } from "../error/sim-rekognition.error.js";
import { SimRekognitionDetectedFace } from "./sim-rekognition-detected-face.js";
import type { SimRekognitionFaceAttributes } from "./sim-rekognition-face-attributes.js";
import type { SimRekognitionFacesResult } from "./sim-rekognition-face-declaration.js";

/**
 * The most faces real Rekognition detects in one image.
 */
const mostFaces = 100;

/**
 * The face result one rule answers with, resolved from its declaration.
 *
 * Faces are reported in the order they were declared. Real Rekognition
 * detects the hundred largest faces in an image, so a declaration with more
 * than that in it describes a response AWS could not return and is refused
 * where it was written.
 */
export class SimRekognitionFaceDetection {
  private readonly faces: readonly SimRekognitionDetectedFace[];

  constructor(result: SimRekognitionFacesResult) {
    if (result.faces.length > mostFaces) {
      throw new SimRekognitionDeclarationError(
        `A simulated Rekognition face result declares ` +
          `${String(result.faces.length)} faces. Real Rekognition detects the ` +
          `${String(mostFaces)} largest faces in an image and no more.`,
      );
    }

    this.faces = result.faces.map(
      (face, index) =>
        new SimRekognitionDetectedFace(`face ${String(index + 1)}`, face),
    );
  }

  /**
   * The face details to report for this result, as one request asked for
   * them.
   */
  detailsFor(
    attributes: SimRekognitionFaceAttributes,
  ): readonly SimRekognitionFaceDetailOutput[] {
    return this.faces.map((face) => face.detailFor(attributes));
  }
}
