import type { SimRekognitionDeclaredBoundingBox } from "../image/sim-rekognition-bounding-box.js";

/**
 * One instance of a declared label, at a place in the image.
 *
 * Real Rekognition reports instances for common objects, so a label declared
 * with two instances is two of that object in the image.
 */
export interface SimRekognitionDeclaredLabelInstance {
  readonly boundingBox: SimRekognitionDeclaredBoundingBox;
  readonly confidence?: number | undefined;
}

/**
 * A label declared against an image, with what Rekognition is to report
 * alongside it.
 *
 * Everything but the name is optional and empty when it is left out. Yulin
 * ships no general label ontology, so nothing here is filled in from a label
 * name: a `Cat` that is to arrive with its parents says what they are.
 */
export interface SimRekognitionDeclaredLabel {
  readonly name: string;
  readonly confidence?: number | undefined;
  readonly parents?: readonly string[] | undefined;
  readonly aliases?: readonly string[] | undefined;
  readonly categories?: readonly string[] | undefined;
  readonly instances?:
    | readonly SimRekognitionDeclaredLabelInstance[]
    | undefined;
}

/**
 * A label as a rule declares it: a label name on its own, or a name with what
 * is to be reported with it.
 */
export type SimRekognitionLabelDeclaration =
  | string
  | SimRekognitionDeclaredLabel;

/**
 * What DetectLabels answers with for an image.
 */
export interface SimRekognitionLabelsResult {
  readonly labels: readonly SimRekognitionLabelDeclaration[];
}

/**
 * Read a declaration that may be a bare label name.
 */
export function simRekognitionDeclaredLabel(
  declaration: SimRekognitionLabelDeclaration,
): SimRekognitionDeclaredLabel {
  if (typeof declaration === "string") {
    return { name: declaration };
  }

  return declaration;
}
