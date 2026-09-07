import type { SimCfnResource } from "../sim-cfn-resource.js";

/**
 * The error a failed in-place update reports, naming the Resource it stopped
 * on.
 *
 * An Error is given the prefix and passed on, so a service's own error type and
 * its stack survive to the Stack that reads it.
 */
export function simCfnResourceUpdateError(
  resource: SimCfnResource,
  error: unknown,
): Error {
  const messagePrefix = `Sim CloudFormation Resource ${resource.logicalId} update failed`;

  /* v8 ignore next -- defensive: a service refuses with an Error */
  const refusal = error instanceof Error ? error : new Error(String(error));

  refusal.message = `${messagePrefix}: ${refusal.message}`;

  return refusal;
}
