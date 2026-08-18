import type { SimRekognitionCollectionFaces } from "../collection/sim-rekognition-collection-faces.js";
import type { SimRekognitionFaceMatchOutput } from "../command/face/face-output.js";
import type { SimRekognitionFaceMatchesResult } from "./sim-rekognition-face-match-declaration.js";
import { SimRekognitionFaceMatchRule } from "./sim-rekognition-face-match-rule.js";

interface SimRekognitionFaceSearch {
  readonly threshold: number;
  readonly mostFaces: number | undefined;
}

/**
 * Keep the most alike report of each face.
 *
 * A face declared twice, once by its face id and once by the external image id
 * it shares with another, is one face in the collection and so one match in
 * the response.
 */
function deduplicated(
  matches: readonly SimRekognitionFaceMatchOutput[],
): readonly SimRekognitionFaceMatchOutput[] {
  const best = new Map<string, SimRekognitionFaceMatchOutput>();

  for (const match of matches) {
    const held = best.get(match.Face.FaceId);

    if (held === undefined || match.Similarity > held.Similarity) {
      best.set(match.Face.FaceId, match);
    }
  }

  return best.values().toArray();
}

/**
 * The face matches one rule answers with, resolved from its declaration.
 *
 * What the rule declares is which indexed faces a search image finds. Which of
 * them a given search reports is decided per call, from the collection it
 * searched and the threshold and limit it asked for.
 */
export class SimRekognitionFaceMatchResult {
  private readonly rules: readonly SimRekognitionFaceMatchRule[];

  constructor(result: SimRekognitionFaceMatchesResult) {
    this.rules = result.matches.map(
      (match, index) =>
        new SimRekognitionFaceMatchRule(
          `face match ${String(index + 1)}`,
          match,
        ),
    );
  }

  /**
   * The matches one search reports, most alike first, as real Rekognition
   * orders them.
   */
  matchesIn(
    faces: SimRekognitionCollectionFaces,
    search: SimRekognitionFaceSearch,
  ): readonly SimRekognitionFaceMatchOutput[] {
    const found = deduplicated(
      this.rules.flatMap((rule) => rule.matchesIn(faces)),
    )
      .filter((match) => match.Similarity >= search.threshold)
      .toSorted((one, other) => other.Similarity - one.Similarity);

    return search.mostFaces === undefined
      ? found
      : found.slice(0, search.mostFaces);
  }
}
