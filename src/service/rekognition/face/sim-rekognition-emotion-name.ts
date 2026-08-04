/**
 * The emotions real Rekognition names on a face.
 *
 * These are appearances rather than feelings, as AWS is careful to say: the
 * value describes what the face looks like and not what the person is.
 *
 * https://docs.aws.amazon.com/rekognition/latest/APIReference/API_Emotion.html
 */
export const simRekognitionEmotionNames = [
  "HAPPY",
  "SAD",
  "ANGRY",
  "CONFUSED",
  "DISGUSTED",
  "SURPRISED",
  "CALM",
  "FEAR",
  "UNKNOWN",
] as const;

/**
 * The name of one emotion Rekognition reports.
 */
export type SimRekognitionEmotionName =
  (typeof simRekognitionEmotionNames)[number];

const emotionNames: ReadonlySet<string> = new Set(simRekognitionEmotionNames);

/**
 * Whether a name is one of the emotions Rekognition reports.
 */
export function isSimRekognitionEmotionName(
  name: string,
): name is SimRekognitionEmotionName {
  return emotionNames.has(name);
}
