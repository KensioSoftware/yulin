import type { SimCfnResourceRecord } from "../sim-cfn-resource-record.js";

interface SimCfnResourceRetentionProperties {
  /**
   * The logical IDs this operation is replacing rather than removing, whose
   * deployed half is kept by UpdateReplacePolicy.
   */
  readonly replaced?: ReadonlySet<string> | undefined;

  /**
   * The logical IDs the caller asked for by name, kept whatever their policy
   * attributes say. DeleteStack RetainResources is what names them.
   */
  readonly named?: ReadonlySet<string> | undefined;
}

/**
 * Which of the Resources an operation is deleting it has to leave behind.
 *
 * Three things can keep a Resource in simulated AWS. The DeleteStack call can
 * name it, UpdateReplacePolicy can keep one a Stack update is replacing, and
 * DeletionPolicy can keep one being removed. They are gathered here so that one
 * delete has one answer.
 *
 * Which of the two attributes applies is the part worth stating. CloudFormation
 * reads UpdateReplacePolicy for a replacement and DeletionPolicy for a removal,
 * and neither stands in for the other. A Resource marked to survive a teardown
 * still goes when an update replaces it.
 *
 * A retention with nothing in it reads DeletionPolicy, the way a plain teardown
 * does.
 */
export class SimCfnResourceRetention {
  private readonly replaced: ReadonlySet<string>;
  private readonly named: ReadonlySet<string>;

  constructor(properties: SimCfnResourceRetentionProperties = {}) {
    this.replaced = properties.replaced ?? new Set();
    this.named = properties.named ?? new Set();
  }

  /**
   * Whether this Resource is to be left in simulated AWS rather than deleted.
   */
  retains(resource: SimCfnResourceRecord): boolean {
    if (this.named.has(resource.logicalId)) {
      return true;
    }

    return this.replaced.has(resource.logicalId)
      ? resource.retainedOnReplace
      : resource.retainedOnDelete;
  }
}
