import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";

/**
 * What a Lambda CloudFormation Resource's creation produced, or a failure
 * naming the Resource that had nothing behind it.
 *
 * Every deletion addresses the object creation left on the Resource, and each
 * one starts here.
 */
export function simCfnLambdaCreatedResource<T extends object>(
  resource: SimCfnResource,
  label: string,
): T {
  const created = resource.simResource as T | undefined;

  assertDefined(
    created,
    `sim Lambda ${label} for CloudFormation Resource ${resource.logicalId}`,
  );

  return created;
}
