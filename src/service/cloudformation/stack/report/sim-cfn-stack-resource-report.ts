import type { SimCfnResource } from "../../resource/sim-cfn-resource.js";
import type { SimCfnIgnoredProperty } from "../../resource/ignore/sim-cfn-ignored-property.type.js";

/**
 * What a Stack's Resources say happened to them.
 *
 * Everything here is read off the Resources rather than collected while the
 * Stack ran, so the Stack and its Resources cannot disagree, and a Stack whose
 * Resources changed under an update reports the Resources it holds now.
 *
 * It does not create, delete, or order Resources.
 */
export class SimCfnStackResourceReport {
  private readonly resources: ReadonlyMap<string, SimCfnResource>;

  constructor(resources: ReadonlyMap<string, SimCfnResource>) {
    this.resources = resources;
  }

  /**
   * Resources that were skipped because their sim implementation is not yet
   * available.
   */
  public get skipped(): readonly SimCfnResource[] {
    return this.matching((resource) => resource.skipped);
  }

  /**
   * Resources a teardown recorded rather than deleted, because sim
   * CloudFormation has no way to delete their Resource type.
   */
  public get deletionSkipped(): readonly SimCfnResource[] {
    return this.matching((resource) => resource.deletionSkipped);
  }

  /**
   * Resources a teardown left in simulated AWS because their DeletionPolicy
   * says to keep them.
   */
  public get retained(): readonly SimCfnResource[] {
    return this.matching((resource) => resource.retained);
  }

  /**
   * Every property a Resource was created without acting on.
   */
  public get ignoredProperties(): readonly SimCfnIgnoredProperty[] {
    return this.resources
      .values()
      .flatMap((resource) => resource.ignoredProperties)
      .toArray();
  }

  private matching(
    predicate: (resource: SimCfnResource) => boolean,
  ): readonly SimCfnResource[] {
    return this.resources.values().filter(predicate).toArray();
  }
}
