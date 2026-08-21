import type { SimCfnDeployedResource } from "../resource/sim-cfn-deployed-resource.type.js";
import type { SimCfnResource } from "../resource/sim-cfn-resource.js";
import type { SimCfnDeployedStack } from "./sim-cfn-deployed-stack.type.js";
import type { SimCfnStack } from "./sim-cfn-stack.js";

/**
 * The Stack object behind what a deployment answered with.
 *
 * A deployment answers with `SimCfnDeployedStack`, the surface a consumer of
 * this package reads. A test in this package that drives the Stack's own
 * lifecycle, or reads the Resource map the deployment builds, wants the object
 * itself, and this says so where it happens.
 */
export function deployedStackObject(stack: SimCfnDeployedStack): SimCfnStack {
  return stack as SimCfnStack;
}

/**
 * The Resource object behind one a deployed Stack answered with.
 *
 * The counterpart of `deployedStackObject`, for a test reaching the Resource
 * members the deployment drives.
 */
export function deployedResourceObject(
  resource: SimCfnDeployedResource,
): SimCfnResource {
  return resource as SimCfnResource;
}
