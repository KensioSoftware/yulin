import type { SimRekognitionFaceDetailOutput } from "../command/detect-faces/detect-faces.command.js";
import type {
  SimRekognitionFaceAttributeName,
  SimRekognitionFaceAttributes,
} from "./sim-rekognition-face-attributes.js";

type SimRekognitionFaceDetailMember = keyof SimRekognitionFaceDetailOutput;

type SimRekognitionMutableFaceDetail = {
  -readonly [
    TMember in SimRekognitionFaceDetailMember
  ]?: SimRekognitionFaceDetailOutput[TMember];
};

/**
 * Builds the FaceDetail one response carries for one face.
 *
 * A member is carried when the request asked for the attribute it belongs to
 * and the face declared a value for it. An attribute with no declared value is
 * left out of the response rather than carried as an undefined member, which
 * is how a real response reports an attribute that was not asked for.
 *
 * The attribute a member belongs to is passed in beside it, because the two
 * do not share a name: `EyesOpen` is the `EYES_OPEN` attribute, and four
 * separate members are the default subset.
 */
export class SimRekognitionFaceDetailBuilder {
  private readonly detail: SimRekognitionMutableFaceDetail = {};

  constructor(private readonly attributes: SimRekognitionFaceAttributes) {}

  /**
   * Carry one member of the detail, if the request wants it and the face has
   * it.
   */
  carry<TMember extends SimRekognitionFaceDetailMember>(
    member: TMember,
    attribute: SimRekognitionFaceAttributeName,
    value: Required<SimRekognitionFaceDetailOutput>[TMember] | undefined,
  ): this {
    if (value === undefined || !this.attributes.wants(attribute)) {
      return this;
    }

    // oxlint-disable-next-line security/detect-object-injection -- a FaceDetail member name, from the code adding it.
    this.detail[member] = value;

    return this;
  }

  /**
   * The detail as built.
   */
  build(): SimRekognitionFaceDetailOutput {
    return this.detail;
  }
}
