/**
 * Every facial landmark real Rekognition reports, in the order it reports
 * them in.
 *
 * The order is the one the AWS `DetectFaces` example response uses, so
 * landmarks come back in the same order whichever order a declaration wrote
 * them in.
 *
 * https://docs.aws.amazon.com/rekognition/latest/APIReference/API_Landmark.html
 */
export const simRekognitionLandmarkNames = [
  "eyeLeft",
  "eyeRight",
  "mouthLeft",
  "mouthRight",
  "nose",
  "leftEyeBrowLeft",
  "leftEyeBrowRight",
  "leftEyeBrowUp",
  "rightEyeBrowLeft",
  "rightEyeBrowRight",
  "rightEyeBrowUp",
  "leftEyeLeft",
  "leftEyeRight",
  "leftEyeUp",
  "leftEyeDown",
  "rightEyeLeft",
  "rightEyeRight",
  "rightEyeUp",
  "rightEyeDown",
  "noseLeft",
  "noseRight",
  "mouthUp",
  "mouthDown",
  "leftPupil",
  "rightPupil",
  "upperJawlineLeft",
  "midJawlineLeft",
  "chinBottom",
  "midJawlineRight",
  "upperJawlineRight",
] as const;

/**
 * The name of one facial landmark.
 */
export type SimRekognitionLandmarkName =
  (typeof simRekognitionLandmarkNames)[number];

/**
 * The landmarks a response carries when `ALL` was not asked for.
 *
 * Real Rekognition reports these five for a default request and the whole set
 * for `ALL`, which is what makes `Attributes` worth simulating: a caller
 * reading `chinBottom` from a default request reads nothing on AWS either.
 *
 * https://docs.aws.amazon.com/rekognition/latest/dg/faces-detect-images.html
 */
export const simRekognitionDefaultLandmarkNames: ReadonlySet<string> =
  new Set<SimRekognitionLandmarkName>([
    "eyeLeft",
    "eyeRight",
    "nose",
    "mouthLeft",
    "mouthRight",
  ]);

const landmarkNames: ReadonlySet<string> = new Set(simRekognitionLandmarkNames);

/**
 * Whether a name is one of the landmarks Rekognition reports.
 */
export function isSimRekognitionLandmarkName(
  name: string,
): name is SimRekognitionLandmarkName {
  return landmarkNames.has(name);
}
