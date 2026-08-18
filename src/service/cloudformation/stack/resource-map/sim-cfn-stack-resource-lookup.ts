import { SimCfnResourceCdkPath } from "../../bind/validate/sim-cfn-resource-cdk-path.js";
import type { SimCfnResource } from "../../resource/sim-cfn-resource.js";

/**
 * Finds one Resource in a Stack by the identifier a caller has for it.
 *
 * A Stack keys its Resources by synthesized logical ID. That is the name a
 * hand-written template gives them. CDK appends a hash to it, and the readable
 * half is the construct ID that bindings already accept. Both names are
 * answered here. A caller that bound a handler by construct ID can then ask the
 * Stack what that binding matched, and never reads the synthesized template.
 *
 * An exact logical ID is answered first. A construct ID is looked for only once
 * no Resource carries the identifier as its logical ID, and a template whose
 * logical IDs read as construct names resolves the way it always has.
 */
export class SimCfnStackResourceLookup {
  private readonly resources: ReadonlyMap<string, SimCfnResource>;

  constructor(resources: ReadonlyMap<string, SimCfnResource>) {
    this.resources = resources;
  }

  /**
   * The Resource this identifier names, by logical ID or CDK construct ID.
   *
   * Two Resources in one Stack cannot share a construct ID, since CDK
   * synthesizes a distinct logical ID per construct. The first match is the
   * only one.
   */
  find(logicalId: string): SimCfnResource | undefined {
    return this.resources.get(logicalId) ?? this.byConstructId(logicalId);
  }

  private byConstructId(constructId: string): SimCfnResource | undefined {
    return this.resources
      .values()
      .find(
        (resource) =>
          new SimCfnResourceCdkPath(resource).constructId() === constructId,
      );
  }
}
