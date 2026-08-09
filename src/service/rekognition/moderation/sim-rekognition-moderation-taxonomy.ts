import { SimRekognitionDeclarationError } from "../error/sim-rekognition.error.js";
import {
  moderationLabels,
  simRekognitionModerationModelVersion,
} from "./sim-rekognition-moderation-labels.js";

/**
 * One label in the moderation taxonomy.
 *
 * A top-level label carries a parent name of `""` rather than no parent at
 * all, which is what real Rekognition puts in `ParentName` for one.
 */
export class SimRekognitionModerationLabelNode {
  constructor(
    public readonly name: string,
    public readonly parentName: string,
    public readonly taxonomyLevel: number,
  ) {}
}

/**
 * The content moderation label taxonomy, as the thing a declared label is
 * resolved against.
 *
 * Declaring a label is declaring a whole chain: real Rekognition returns the
 * detected label together with every label above it, so an image declared as
 * `Weapon Violence` comes back as that, its `Graphic Violence` parent, and the
 * top-level category above that. Handler code filtering on the top-level
 * category therefore sees what it would see on AWS.
 */
export class SimRekognitionModerationTaxonomy {
  private readonly nodes = new Map<string, SimRekognitionModerationLabelNode>();

  constructor() {
    for (const [name, parentName] of moderationLabels) {
      this.nodes.set(
        name,
        new SimRekognitionModerationLabelNode(
          name,
          parentName,
          this.levelOf(parentName) + 1,
        ),
      );
    }
  }

  /**
   * Whether a name is a label in this taxonomy.
   */
  has(name: string): boolean {
    return this.nodes.has(name);
  }

  /**
   * The chain of labels a detected label comes back with, from the top-level
   * category down to the label itself.
   */
  chain(name: string): readonly SimRekognitionModerationLabelNode[] {
    const node = this.require(name);

    if (node.parentName === "") {
      return [node];
    }

    return [...this.chain(node.parentName), node];
  }

  /**
   * Get a label by name, refusing one this taxonomy does not have.
   */
  require(name: string): SimRekognitionModerationLabelNode {
    const node = this.nodes.get(name);

    if (node === undefined) {
      throw new SimRekognitionDeclarationError(
        `'${name}' is not a Rekognition moderation label. Declare one of the ` +
          `${String(this.nodes.size)} labels in the version ` +
          `${simRekognitionModerationModelVersion} content moderation ` +
          `taxonomy, such as 'Violence' or 'Gambling'.`,
      );
    }

    return node;
  }

  /**
   * How deep a parent sits, so its children can be numbered below it.
   *
   * The labels are declared parents-first, so a parent is always in place by
   * the time its children are built.
   */
  private levelOf(parentName: string): number {
    if (parentName === "") {
      return 0;
    }

    return this.require(parentName).taxonomyLevel;
  }
}

/**
 * The one taxonomy instance the simulation resolves labels against.
 *
 * It holds no per-simulation state, only the published label list, so there is
 * nothing for one SimAws to leak into another through it.
 */
export const simRekognitionModerationTaxonomy =
  new SimRekognitionModerationTaxonomy();

export { simRekognitionModerationModelVersion } from "./sim-rekognition-moderation-labels.js";
