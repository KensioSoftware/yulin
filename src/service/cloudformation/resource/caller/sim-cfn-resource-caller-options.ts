import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";

/**
 * The request options a Resource operation makes its service calls with.
 *
 * Every simulated service takes a caller the same way, so one shape carries the
 * deployment's principal from the Stack down to the commands that create and
 * delete Resources. Absent where the deployment named no caller, which leaves
 * each service to its own default of the Account root.
 */
export type SimCfnResourceCallerOptions =
  | { readonly caller: SimAwsCaller }
  | undefined;

/**
 * The request options naming a deployment's caller, or none where it has none.
 */
export function simCfnResourceCallerOptions(
  caller: SimAwsCaller | undefined,
): SimCfnResourceCallerOptions {
  return caller === undefined ? undefined : { caller };
}
