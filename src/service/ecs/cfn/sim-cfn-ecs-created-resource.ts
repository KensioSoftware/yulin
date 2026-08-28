import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";

/**
 * The simulated resource a Resource created, which a teardown reaches it by.
 */
export function simCfnEcsCreatedResource<T extends object>(
  resource: SimCfnResource,
  described: string,
): T {
  const created = resource.simResource as T | undefined;

  assertDefined(
    created,
    `sim ECS ${described} for CloudFormation Resource ${resource.logicalId}`,
  );

  return created;
}
