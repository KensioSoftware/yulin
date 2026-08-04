import type { SimRekognitionFacesResult } from "../face/sim-rekognition-face-declaration.js";
import {
  simRekognitionDefaultFaces,
  simRekognitionNoFaces,
  simRekognitionSeveralFaces,
} from "../face/sim-rekognition-face-defaults.js";
import type { SimRekognitionModerationResult } from "../moderation/sim-rekognition-moderation-result.js";
import { simRekognitionSampleImageFiles as files } from "./sim-rekognition-sample-image-files.js";
import type { SimRekognitionSampleImage } from "./sim-rekognition-sample-image.js";

/**
 * What one sample image is declared to hold.
 */
export interface SimRekognitionSampleRule<TResult> {
  readonly image: SimRekognitionSampleImage;
  readonly result: TResult;
}

/**
 * What the sample images are declared as for content moderation.
 *
 * The clean image is declared rather than left to the default, so it stays
 * clean in a test that declared everything else as failing.
 *
 * `Weapon Violence` is a third level label, so the flagged image arrives with
 * `Violence` and `Graphic Violence` above it and exercises the chain a real
 * moderation handler reads.
 */
export const simRekognitionSampleModerationRules: readonly SimRekognitionSampleRule<SimRekognitionModerationResult>[] =
  [
    { image: files.passesModeration, result: { labels: [] } },
    {
      image: files.flaggedByModeration,
      result: { labels: ["Weapon Violence"] },
    },
  ];

/**
 * What the sample images are declared as for face detection.
 *
 * The one face image answers with the built-in default face, which is the
 * face from the AWS DetectFaces example response and carries every attribute.
 */
export const simRekognitionSampleFaceRules: readonly SimRekognitionSampleRule<SimRekognitionFacesResult>[] =
  [
    { image: files.noFaces, result: simRekognitionNoFaces },
    { image: files.oneFace, result: simRekognitionDefaultFaces },
    { image: files.severalFaces, result: simRekognitionSeveralFaces },
  ];
