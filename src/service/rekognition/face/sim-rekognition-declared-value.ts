import type {
  SimRekognitionDeclaredEmotion,
  SimRekognitionDeclaredFaceFeature,
  SimRekognitionDeclaredGender,
} from "./sim-rekognition-face-declaration.js";

/**
 * What a declaration says, whichever of its two forms it was written in.
 *
 * Several face attributes can be declared as a bare value or as a value with a
 * confidence, in the way a label can be declared as a bare name. The
 * confidence is left undefined when it was not declared, so the face's own
 * confidence can stand in for it.
 */
export interface SimRekognitionDeclaredValue<TValue> {
  readonly value: TValue;
  readonly confidence: number | undefined;
}

/**
 * Read a yes or no attribute that may be a bare boolean.
 */
export function simRekognitionDeclaredFaceFeature(
  declaration: SimRekognitionDeclaredFaceFeature,
): SimRekognitionDeclaredValue<boolean> {
  if (typeof declaration === "boolean") {
    return { value: declaration, confidence: undefined };
  }

  return { value: declaration.value, confidence: declaration.confidence };
}

/**
 * Read a gender that may be a bare value.
 */
export function simRekognitionDeclaredGender(
  declaration: SimRekognitionDeclaredGender,
): SimRekognitionDeclaredValue<string> {
  if (typeof declaration === "string") {
    return { value: declaration, confidence: undefined };
  }

  return { value: declaration.value, confidence: declaration.confidence };
}

/**
 * Read an emotion that may be a bare name.
 */
export function simRekognitionDeclaredEmotion(
  declaration: SimRekognitionDeclaredEmotion,
): SimRekognitionDeclaredValue<string> {
  if (typeof declaration === "string") {
    return { value: declaration, confidence: undefined };
  }

  return { value: declaration.type, confidence: declaration.confidence };
}
