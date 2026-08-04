import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimRekognitionBoundingBoxOutput } from "../../image/sim-rekognition-bounding-box.js";
import type { SimRekognitionImageInput } from "../../image/sim-rekognition-image-input.js";

/**
 * A name Rekognition reports alongside a detected label: a parent, an alias
 * or a category.
 *
 * All three are the same shape on the wire, and all three are separate types
 * in the SDK, so one structural type stands in for each of them.
 *
 * https://docs.aws.amazon.com/rekognition/latest/APIReference/API_Parent.html
 */
export interface SimRekognitionLabelNameOutput {
  readonly Name: string;
}

/**
 * One instance of a detected label, located in the image.
 *
 * https://docs.aws.amazon.com/rekognition/latest/APIReference/API_Instance.html
 */
export interface SimRekognitionLabelInstanceOutput {
  readonly BoundingBox: SimRekognitionBoundingBoxOutput;
  readonly Confidence: number;
}

/**
 * A detected label: an object, a scene or a concept found in an image.
 *
 * https://docs.aws.amazon.com/rekognition/latest/APIReference/API_Label.html
 */
export interface SimRekognitionLabelOutput {
  readonly Name: string;
  readonly Confidence: number;
  readonly Parents: readonly SimRekognitionLabelNameOutput[];
  readonly Aliases: readonly SimRekognitionLabelNameOutput[];
  readonly Categories: readonly SimRekognitionLabelNameOutput[];
  readonly Instances: readonly SimRekognitionLabelInstanceOutput[];
}

/**
 * Minimal structural sim Rekognition DetectLabels command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/rekognition/command/DetectLabelsCommand/
 */
export interface SimDetectLabelsCommand {
  readonly input: SimDetectLabelsCommandInput;
}

export interface SimDetectLabelsCommandInput {
  readonly Image?: SimRekognitionImageInput | undefined;
  readonly MaxLabels?: number | undefined;
  readonly MinConfidence?: number | undefined;
  readonly Features?: readonly string[] | undefined;
}

export interface SimDetectLabelsCommandOutput {
  readonly Labels: readonly SimRekognitionLabelOutput[];
  readonly LabelModelVersion: string;
  readonly $metadata: SimResponseMetadata;
}
