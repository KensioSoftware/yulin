import type { SimRekognitionEmotionOutput } from "../command/detect-faces/detect-faces.command.js";
import { SimRekognitionDeclarationError } from "../error/sim-rekognition.error.js";
import type { SimRekognitionDeclaredConfidence } from "../rule/sim-rekognition-declared-confidence.js";
import { isSimRekognitionEmotionName } from "./sim-rekognition-emotion-name.js";
import { simRekognitionDeclaredEmotion } from "./sim-rekognition-declared-value.js";
import type { SimRekognitionDeclaredEmotion } from "./sim-rekognition-face-declaration.js";
import type { SimRekognitionFaceDetailBuilder } from "./sim-rekognition-face-detail-builder.js";

/**
 * The emotions one declared face appears to express.
 *
 * They are reported in descending order of confidence, which is the order real
 * Rekognition reports them in. An emotion declared as a bare name takes the
 * face's own confidence.
 */
export class SimRekognitionFaceEmotions {
  private readonly emotions: readonly SimRekognitionEmotionOutput[];

  constructor(
    private readonly subject: string,
    confidence: SimRekognitionDeclaredConfidence,
    declared: readonly SimRekognitionDeclaredEmotion[] = [],
  ) {
    this.emotions = declared
      .map((emotion) => this.emotionOf(confidence, emotion))
      .toSorted((one, other) => other.Confidence - one.Confidence);

    this.refuseRepeated();
  }

  /**
   * Add the emotions this face declared to a detail.
   */
  addTo(builder: SimRekognitionFaceDetailBuilder): void {
    if (this.emotions.length === 0) {
      return;
    }

    builder.carry("Emotions", "EMOTIONS", this.emotions);
  }

  private emotionOf(
    confidence: SimRekognitionDeclaredConfidence,
    declared: SimRekognitionDeclaredEmotion,
  ): SimRekognitionEmotionOutput {
    const emotion = simRekognitionDeclaredEmotion(declared);

    return {
      Type: this.emotionName(emotion.value),
      Confidence: confidence.of(this.subject, emotion.confidence),
    };
  }

  private emotionName(name: string): string {
    if (isSimRekognitionEmotionName(name)) {
      return name;
    }

    throw new SimRekognitionDeclarationError(
      `'${name}' declared for '${this.subject}' is not an emotion ` +
        `Rekognition reports.`,
    );
  }

  private refuseRepeated(): void {
    const reported = new Set<string>();

    for (const emotion of this.emotions) {
      if (reported.has(emotion.Type)) {
        throw new SimRekognitionDeclarationError(
          `'${emotion.Type}' is declared twice for '${this.subject}'. Real ` +
            `Rekognition reports each emotion once.`,
        );
      }

      reported.add(emotion.Type);
    }
  }
}
