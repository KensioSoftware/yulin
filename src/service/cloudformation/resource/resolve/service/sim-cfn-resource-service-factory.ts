import type { SimAws } from "../../../../aws/sim-aws.js";
import type { SimCfnServiceResourceFactory } from "../../factory/sim-cfn-resource-factory.type.js";
import type { SimCfnResource } from "../../sim-cfn-resource.js";
import { parseSimCloudFormationResourceType } from "../../parser/sim-cfn-resource-parser.js";
import { isSimCfnUnsupportedResourceError } from "../../unsupported/sim-cfn-unsupported-resource.js";
import { resolveSimCloudFormationServiceResourceFactory } from "./sim-cfn-service-resolver.js";

/**
 * A Resource's service factory, and the type name that factory knows it by.
 */
export interface SimCfnResourceServiceFactory {
  readonly factory: SimCfnServiceResourceFactory;
  readonly resourceTypeName: string;
}

/**
 * The service factory owning a Resource, where a service owns it.
 *
 * An untyped Resource and one whose type no service simulates both come back
 * undefined. Update work asks this before a Stack is changed, and a Resource
 * nothing can create is a Resource nothing can update either.
 */
export function simCfnResourceServiceFactory(
  simAws: SimAws,
  resource: SimCfnResource,
): SimCfnResourceServiceFactory | undefined {
  const { type } = resource;

  if (type === undefined) {
    return undefined;
  }

  const resourceType = parseSimCloudFormationResourceType(type);

  try {
    return {
      factory: resolveSimCloudFormationServiceResourceFactory(
        simAws,
        resource.accountRegionScope,
        resourceType,
      ),
      resourceTypeName: resourceType.resourceTypeName,
    };
  } catch (error) {
    if (isSimCfnUnsupportedResourceError(error)) {
      return undefined;
    }

    /* v8 ignore next -- defensive: the resolver refuses with nothing else */
    throw error;
  }
}
