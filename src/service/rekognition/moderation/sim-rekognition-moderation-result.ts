import type { SimRekognitionModerationLabelOutput } from "../command/detect-moderation-labels/detect-moderation-labels.command.js";
import { SimRekognitionDeclaredConfidence } from "../rule/sim-rekognition-declared-confidence.js";
import {
  type SimRekognitionModerationLabelNode,
  simRekognitionModerationTaxonomy,
} from "./sim-rekognition-moderation-taxonomy.js";

/**
 * The confidence a declared label carries when none is declared for it.
 *
 * Real Rekognition confidences are float32 values that print with a long
 * tail, so declared confidences pass through Math.fround and this default is
 * one of them rather than a round number. A test that asserts on the exact
 * value is asserting on something the shape of what AWS returns.
 */
const moderationConfidence = new SimRekognitionDeclaredConfidence(96.68);

/**
 * A moderation label declared against an image, with the confidence
 * Rekognition is to report it at.
 */
export interface SimRekognitionDeclaredModerationLabel {
  readonly name: string;
  readonly confidence?: number | undefined;
}

/**
 * A moderation label as a rule declares it: a label name on its own, or a
 * name with the confidence to report it at.
 */
export type SimRekognitionModerationLabelDeclaration =
  | string
  | SimRekognitionDeclaredModerationLabel;

/**
 * What DetectModerationLabels answers with for an image.
 *
 * An empty `labels` is a clean image, which is what most images are and what
 * the built-in default rule declares.
 */
export interface SimRekognitionModerationResult {
  readonly labels: readonly SimRekognitionModerationLabelDeclaration[];
}

/**
 * One declared label and the labels above it in the taxonomy.
 *
 * Every label in a chain carries the chain's confidence, so filtering a whole
 * chain in or out on `MinConfidence` cannot leave a label naming a parent that
 * is not in the response.
 */
class SimRekognitionModerationChain {
  public readonly confidence: number;
  public readonly nodes: readonly SimRekognitionModerationLabelNode[];

  constructor(declaration: SimRekognitionModerationLabelDeclaration) {
    const declared = SimRekognitionModerationChain.declared(declaration);

    this.confidence = moderationConfidence.of(
      declared.name,
      declared.confidence,
    );
    this.nodes = simRekognitionModerationTaxonomy.chain(declared.name);
  }

  private static declared(
    declaration: SimRekognitionModerationLabelDeclaration,
  ): SimRekognitionDeclaredModerationLabel {
    if (typeof declaration === "string") {
      return { name: declaration };
    }

    return declaration;
  }
}

/**
 * The moderation result one rule answers with, resolved against the taxonomy.
 *
 * The declaration is resolved when the rule is registered rather than when a
 * detection runs, so a label real Rekognition has never heard of is refused
 * where it was written.
 */
export class SimRekognitionModerationDetection {
  private readonly chains: readonly SimRekognitionModerationChain[];

  constructor(result: SimRekognitionModerationResult) {
    this.chains = result.labels.map(
      (declaration) => new SimRekognitionModerationChain(declaration),
    );
  }

  /**
   * The labels to report for this result at a given minimum confidence.
   *
   * A label declared in two chains, as two labels sharing a parent are, is
   * reported once at the highest confidence any of its chains declared. Real
   * Rekognition reports a parent at least as confidently as the child that
   * implies it, so taking the highest is what keeps a parent from being
   * filtered out from under a child that survived.
   */
  labelsAbove(
    minConfidence: number,
  ): readonly SimRekognitionModerationLabelOutput[] {
    const highest = new Map<string, SimRekognitionModerationLabelOutput>();

    for (const chain of this.chains) {
      for (const node of chain.nodes) {
        const found = highest.get(node.name);

        if (found === undefined || found.Confidence < chain.confidence) {
          highest.set(node.name, this.label(node, chain.confidence));
        }
      }
    }

    return highest
      .values()
      .filter((label) => label.Confidence >= minConfidence)
      .toArray();
  }

  private label(
    node: SimRekognitionModerationLabelNode,
    confidence: number,
  ): SimRekognitionModerationLabelOutput {
    return {
      Confidence: confidence,
      Name: node.name,
      ParentName: node.parentName,
      TaxonomyLevel: node.taxonomyLevel,
    };
  }
}
