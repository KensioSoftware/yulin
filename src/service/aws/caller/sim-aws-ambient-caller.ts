import type { SimAwsPrincipal } from "./sim-aws-caller.js";
import {
  simAwsRunAsContext,
  type SimAwsRunAsOwner,
} from "./sim-aws-run-as-context.js";

/**
 * Where a call that names no caller of its own looks for one first.
 *
 * A `SimAws.runAs` block is what sets an ambient caller today. Asking through
 * this interface keeps the resolver clear of Node.js asynchronous context
 * tracking, and leaves room for the other thing that will set one, a simulated
 * Lambda invocation running under an execution role.
 */
export interface SimAwsAmbientCaller {
  /**
   * The caller ambient where the call is being made, if there is one.
   */
  currentCaller(): SimAwsPrincipal | undefined;
}

/**
 * The ambient caller of the `runAs` block one simulation is inside.
 *
 * Only that simulation's own runs count. Each SimAws instance is its own
 * simulated universe, so a `runAs` on one never decides what another observes.
 */
export function simAwsRunAsAmbientCaller(
  owner: SimAwsRunAsOwner,
): SimAwsAmbientCaller {
  return {
    currentCaller: (): SimAwsPrincipal | undefined =>
      simAwsRunAsContext.currentCaller(owner),
  };
}
