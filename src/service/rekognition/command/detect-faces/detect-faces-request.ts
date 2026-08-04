import { SimRekognitionFaceAttributes } from "../../face/sim-rekognition-face-attributes.js";
import {
  type SimRekognitionImageRequest,
  SimRekognitionImageRequests,
} from "../../image/sim-rekognition-image-request.js";
import { SimRekognitionUnsimulatedInput } from "../sim-rekognition-unsimulated-input.js";
import type { SimDetectFacesCommandInput } from "./detect-faces.command.js";

const operation = "DetectFaces";
const acceptedInput = ["Image", "Attributes"];

/**
 * A DetectFaces request, checked before anything acts on it.
 */
export class DetectFacesRequest {
  public readonly image: SimRekognitionImageRequest;
  public readonly attributes: SimRekognitionFaceAttributes;

  constructor(input: SimDetectFacesCommandInput) {
    new SimRekognitionUnsimulatedInput(operation).refuseUnaccepted(
      input,
      acceptedInput,
    );

    this.image = new SimRekognitionImageRequests(operation).parse(input.Image);
    this.attributes = new SimRekognitionFaceAttributes(input.Attributes);
  }
}
