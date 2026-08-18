import type { SimRekognitionCollectionFaces } from "../collection/sim-rekognition-collection-faces.js";
import type { SimRekognitionIndexedFace } from "../collection/sim-rekognition-indexed-face.js";
import type { SimRekognitionFaceMatchOutput } from "../command/face/face-output.js";
import { SimRekognitionDeclarationError } from "../error/sim-rekognition.error.js";
import { SimRekognitionDeclaredConfidence } from "../rule/sim-rekognition-declared-confidence.js";
import type { SimRekognitionDeclaredFaceMatch } from "./sim-rekognition-face-match-declaration.js";

/**
 * How alike a match is reported as when the declaration says nothing.
 *
 * It is the similarity in the AWS SearchFacesByImage example response, so an
 * undeclared one has the float32 tail a real match has, and sits above the
 * default `FaceMatchThreshold` of 80 that a search applies to it.
 */
const matchSimilarity = new SimRekognitionDeclaredConfidence(99.97222137451172);

interface SimRekognitionFaceMatchIdentifier {
  readonly kind: "faceId" | "externalImageId";
  readonly value: string;
}

function identifierOf(
  subject: string,
  declared: SimRekognitionDeclaredFaceMatch,
): SimRekognitionFaceMatchIdentifier {
  const { faceId, externalImageId } = declared;

  if (faceId !== undefined && externalImageId !== undefined) {
    throw new SimRekognitionDeclarationError(
      `A face match declared for '${subject}' names both a faceId and an ` +
        `externalImageId. A match names the one face id IndexFaces answered ` +
        `with, or the external image id it was indexed under, and not both.`,
    );
  }

  if (faceId !== undefined) {
    return { kind: "faceId", value: faceId };
  }

  if (externalImageId !== undefined) {
    return { kind: "externalImageId", value: externalImageId };
  }

  throw new SimRekognitionDeclarationError(
    `A face match declared for '${subject}' names no face. A match needs ` +
      `either a faceId or an externalImageId to say which indexed face a ` +
      `search finds.`,
  );
}

/**
 * One declared face match, resolved from its declaration.
 *
 * The declaration is resolved when the rule is registered, so a similarity
 * outside the range Rekognition reports, or a match naming both kinds of id at
 * once, is refused where it was written. Which faces it reaches is resolved
 * per search, because the collection being searched is what decides that.
 */
export class SimRekognitionFaceMatchRule {
  private readonly identifier: SimRekognitionFaceMatchIdentifier;
  private readonly similarity: number;

  constructor(subject: string, declared: SimRekognitionDeclaredFaceMatch) {
    this.identifier = identifierOf(subject, declared);
    this.similarity = matchSimilarity.of(subject, declared.similarity);
  }

  /**
   * What this rule finds in one collection.
   *
   * An external image id can name several faces, since real Rekognition takes
   * one as a label the caller chose rather than as a key, so a photograph of
   * the same person indexed twice is found twice.
   */
  matchesIn(
    faces: SimRekognitionCollectionFaces,
  ): readonly SimRekognitionFaceMatchOutput[] {
    return this.facesIn(faces).map((face) => ({
      Similarity: this.similarity,
      Face: face.stored(),
    }));
  }

  private facesIn(
    faces: SimRekognitionCollectionFaces,
  ): readonly SimRekognitionIndexedFace[] {
    if (this.identifier.kind === "externalImageId") {
      return faces.withExternalImageId(this.identifier.value);
    }

    const face = faces.withFaceId(this.identifier.value);

    return face === undefined ? [] : [face];
  }
}
