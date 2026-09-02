import type { SimCfnResourceRecord } from "../sim-cfn-resource-record.js";

interface SimCfnResourceRetentionProperties {
  /**
   * For each logical ID this operation is replacing, whether the definition
   * taking its place says to keep the deployed Resource.
   *
   * The answer comes from the new definition because that is the template
   * CloudFormation is applying. An update that adds `UpdateReplacePolicy:
   * Retain` keeps the Resource it replaces, and one that drops the attribute
   * deletes it.
   */
  readonly replaced?: ReadonlyMap<string, boolean> | undefined;

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
  private readonly replaced: ReadonlyMap<string, boolean>;
  private readonly named: ReadonlySet<string>;

  constructor(properties: SimCfnResourceRetentionProperties = {}) {
    this.replaced = properties.replaced ?? new Map();
    this.named = properties.named ?? new Set();
  }

  /**
   * Whether this Resource is to be left in simulated AWS rather than deleted.
   */
  retains(resource: SimCfnResourceRecord): boolean {
    if (this.named.has(resource.logicalId)) {
      return true;
    }

    return this.replaced.get(resource.logicalId) ?? resource.retainedOnDelete;
  }
}
