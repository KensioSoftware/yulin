import type { SimCfnIgnoredProperty } from "./sim-cfn-ignored-property.type.js";

/**
 * What a recorded property names as the Resource it was declared on.
 */
interface SimCfnIgnoredPropertyResource {
  readonly logicalId: string;
  readonly type: string | undefined;
}

/**
 * The properties one CloudFormation Resource was created without acting on.
 *
 * Simulated CloudFormation deploys what it can. A Resource type it does not
 * simulate is skipped and the rest of the stack still deploys; this is the
 * same answer one level down, for a property the Resource's own service cannot
 * act on. The Resource is created without it and the omission is recorded
 * here, rather than the property taking the Resource, or the stack, down with
 * it.
 *
 * The record is the point. An ignored property means the simulated Resource
 * behaves differently to the one the template describes, so a test asserting
 * on that behaviour needs somewhere to find out that it was never configured.
 *
 * Properties nothing simulated could tell apart are not recorded here, since a
 * list of differences that make no difference is a list nobody can read. Each
 * service decides which of its own properties those are.
 */
export class SimCfnIgnoredProperties {
  #ignored: SimCfnIgnoredProperty[] = [];

  /**
   * Every property ignored on the current creation attempt.
   */
  public get all(): readonly SimCfnIgnoredProperty[] {
    return this.#ignored;
  }

  /**
   * Record a property the Resource was created without.
   *
   * A property recorded twice on one attempt is kept once, since two levels of
   * the same parse noticing the same omission is a detail of how the template
   * was read rather than something a reader needs told twice.
   */
  record(
    resource: SimCfnIgnoredPropertyResource,
    path: string,
    reason: string,
  ): void {
    const already = this.#ignored.some((entry) => {
      return entry.path === path && entry.reason === reason;
    });

    if (already) {
      return;
    }

    this.#ignored.push({
      logicalId: resource.logicalId,
      resourceType: resource.type ?? "",
      path,
      reason,
    });
  }

  /**
   * Forget everything recorded, for a Resource starting creation again.
   */
  clear(): void {
    this.#ignored = [];
  }
}
