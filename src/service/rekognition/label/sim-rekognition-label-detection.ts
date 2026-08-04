import type { SimRekognitionLabelOutput } from "../command/detect-labels/detect-labels.command.js";
import { simRekognitionDetectedLabel } from "./sim-rekognition-detected-label.js";
import {
  simRekognitionDeclaredLabel,
  type SimRekognitionLabelsResult,
} from "./sim-rekognition-label-declaration.js";

/**
 * How one request narrows the labels a result answers with.
 */
export interface SimRekognitionLabelFilter {
  readonly minConfidence: number;
  readonly maxLabels: number | undefined;
}

/**
 * The label result one rule answers with, resolved from its declaration.
 *
 * The declaration is resolved when the rule is registered rather than when a
 * detection runs, so a confidence or a bounding box that is out of range is
 * refused where it was written.
 *
 * Labels are ordered by descending confidence, which is the order real
 * Rekognition reports them in and what makes `MaxLabels` the most confident
 * labels rather than the first ones declared.
 */
export class SimRekognitionLabelDetection {
  private readonly labels: readonly SimRekognitionLabelOutput[];

  constructor(result: SimRekognitionLabelsResult) {
    this.labels = result.labels
      .map((declaration) =>
        simRekognitionDetectedLabel(simRekognitionDeclaredLabel(declaration)),
      )
      .toSorted((one, other) => other.Confidence - one.Confidence);
  }

  /**
   * The labels to report for this result, as one request asked for them.
   *
   * `MaxLabels` applies after the confidence filter, so a request for three
   * labels at 90 does not spend its three on labels that then filter out.
   */
  labelsFor(
    filter: SimRekognitionLabelFilter,
  ): readonly SimRekognitionLabelOutput[] {
    const confident = this.labels.filter(
      (label) => label.Confidence >= filter.minConfidence,
    );

    if (filter.maxLabels === undefined) {
      return confident;
    }

    return confident.slice(0, filter.maxLabels);
  }
}
