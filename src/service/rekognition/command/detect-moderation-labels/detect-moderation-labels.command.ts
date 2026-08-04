import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimRekognitionImageInput } from "../../image/sim-rekognition-image-input.js";

/**
 * A detected moderation label, with the label above it in the taxonomy.
 *
 * https://docs.aws.amazon.com/rekognition/latest/APIReference/API_ModerationLabel.html
 */
export interface SimRekognitionModerationLabelOutput {
  readonly Confidence: number;
  readonly Name: string;
  readonly ParentName: string;
  readonly TaxonomyLevel: number;
}

/**
 * A kind of content an image was identified as, such as animated or
 * illustrated.
 *
 * https://docs.aws.amazon.com/rekognition/latest/APIReference/API_ContentType.html
 */
export interface SimRekognitionContentTypeOutput {
  readonly Confidence?: number | undefined;
  readonly Name?: string | undefined;
}

/**
 * Minimal structural sim Rekognition DetectModerationLabels command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/rekognition/command/DetectModerationLabelsCommand/
 */
export interface SimDetectModerationLabelsCommand {
  readonly input: SimDetectModerationLabelsCommandInput;
}

export interface SimDetectModerationLabelsCommandInput {
  readonly Image?: SimRekognitionImageInput | undefined;
  readonly MinConfidence?: number | undefined;
}

export interface SimDetectModerationLabelsCommandOutput {
  readonly ModerationLabels: readonly SimRekognitionModerationLabelOutput[];
  readonly ModerationModelVersion: string;
  readonly ContentTypes: readonly SimRekognitionContentTypeOutput[];
  readonly $metadata: SimResponseMetadata;
}
