import type { SimAws } from "../../../aws/sim-aws.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimCfnServiceResourceFactory } from "../factory/sim-cfn-resource-factory.type.js";
import type { SimCfnResource } from "../sim-cfn-resource.js";
import { parseSimCloudFormationResourceType } from "../parser/sim-cfn-resource-parser.js";
import { resolveSimCloudFormationServiceResourceFactory } from "../resolve/service/sim-cfn-service-resolver.js";
import { isSimCfnUnsupportedResourceError } from "../unsupported/sim-cfn-unsupported-resource.js";

interface SimCfnResourceUpdateValidatorProperties {
  readonly current: SimCfnResource;
  readonly updated: SimCfnResource;
}

interface AssertSimCfnResourceUpdateAllowedProperties {
  readonly simAws: SimAws;
  readonly currentResources: ReadonlyMap<string, SimCfnResource>;
  readonly updatedResources: ReadonlyMap<string, SimCfnResource>;
  readonly caller?: SimAwsCaller | undefined;
}

/**
 * Runs service-specific validation for one Resource replacement.
 */
export class SimCfnResourceUpdateValidator {
  private readonly current: SimCfnResource;
  private readonly updated: SimCfnResource;

  constructor(properties: SimCfnResourceUpdateValidatorProperties) {
    this.current = properties.current;
    this.updated = properties.updated;
  }

  /**
   * Refuse an invalid update before its current Resource is deleted.
   */
  async assertAllowed(
    properties: AssertSimCfnResourceUpdateAllowedProperties,
  ): Promise<void> {
    const { current, updated } = this;
    const { simAws, currentResources, updatedResources, caller } = properties;
    const { type } = updated;

    if (type === undefined || current.type !== type) {
      return;
    }

    const resourceType = parseSimCloudFormationResourceType(type);
    let factory: SimCfnServiceResourceFactory;

    try {
      factory = resolveSimCloudFormationServiceResourceFactory(
        simAws,
        updated.accountRegionScope,
        resourceType,
      );
    } catch (error) {
      if (isSimCfnUnsupportedResourceError(error)) {
        return;
      }

      throw error;
    }

    if (factory.assertUpdateAllowed === undefined) {
      return;
    }

    await factory.assertUpdateAllowed(
      resourceType.resourceTypeName,
      current,
      updated,
      {
        simAws,
        currentResources,
        updatedResources,
        currentResolvedProperties: await current.resolvedProperties({
          simAws,
          resources: currentResources,
          caller,
        }),
        updatedResolvedProperties: await updated.resolvedProperties({
          simAws,
          resources: updatedResources,
          caller,
        }),
        caller,
      },
    );
  }
}
