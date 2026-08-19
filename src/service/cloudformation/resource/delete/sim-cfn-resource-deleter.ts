import type { SimCfnResource } from "../sim-cfn-resource.js";
import type { SimCloudFormationResourceDeleteContext } from "../sim-cfn-resource.type.js";
import type { SimCfnServiceResourceFactory } from "../factory/sim-cfn-resource-factory.type.js";
import { parseSimCloudFormationResourceType } from "../parser/sim-cfn-resource-parser.js";
import { resolveSimCloudFormationServiceResourceFactory } from "../resolve/service/sim-cfn-service-resolver.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";

interface SimCfnResourceDeleterProperties<T extends object> {
  readonly resource: SimCfnResource<T>;
  readonly cfnResourceFactory?: SimCfnServiceResourceFactory | undefined;
}

/**
 * Removes the underlying simulated AWS service Resource for a CloudFormation
 * Resource.
 *
 * The mirror image of `SimCfnResourceCreator`: it parses the
 * CloudFormation Resource type, resolves the owning service's factory, resolves
 * the Resource's Properties, and asks that factory to delete. Which command
 * removes a given Resource type, and what has to happen first, is the service's
 * business rather than the engine's.
 *
 * It does not manage the asynchronous CloudFormation operation lifecycle.
 * Background scheduling, Resource state transitions, and failure handling
 * belong to SimCfnResourceDeleteOperation.
 */
export class SimCfnResourceDeleter<T extends object = object> {
  private readonly resource: SimCfnResource<T>;
  private readonly cfnResourceFactory: SimCfnServiceResourceFactory | undefined;

  constructor(properties: SimCfnResourceDeleterProperties<T>) {
    this.resource = properties.resource;
    this.cfnResourceFactory = properties.cfnResourceFactory;
  }

  /**
   * Delete the underlying simulated AWS service Resource.
   *
   * A Resource that never reached simulated AWS has nothing to delete. That
   * covers a Resource whose type this simulation skipped creating, and one the
   * Stack never got as far as, so a partly deployed Stack can still be torn
   * down.
   */
  async delete(context: SimCloudFormationResourceDeleteContext): Promise<void> {
    if (!this.resource.deployed) {
      return;
    }

    const { type } = this.resource;
    assertDefined(
      type,
      `Sim CloudFormation Resource ${this.resource.logicalId} is missing a Type`,
    );

    const resourceType = parseSimCloudFormationResourceType(type);
    const factory =
      this.cfnResourceFactory ??
      resolveSimCloudFormationServiceResourceFactory(
        context.simAws,
        this.resource.accountRegionScope,
        resourceType,
      );

    await factory.delete(resourceType.resourceTypeName, this.resource, {
      ...context,
      resolvedProperties: await this.resource.resolvedProperties(context),
    });
  }
}
