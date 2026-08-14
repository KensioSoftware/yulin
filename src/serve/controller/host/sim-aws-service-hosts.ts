import type { SimAwsServiceTarget } from "../sim-service-controller.js";

/**
 * Where a hostname a simulated resource answers on is looked up.
 *
 * Most simulated AWS hostnames have a shape that says which service and
 * resource they name, and those are recognised by pattern while a request is
 * resolved. A hostname the request chose, such as a Cognito user pool custom
 * domain, has no shape to recognise, so whatever holds those resources answers
 * for them here instead.
 */
export interface SimAwsServiceHosts {
  /**
   * The simulated service target a hostname names, if a resource claimed it.
   */
  targetForHost(hostname: string): SimAwsServiceTarget | undefined;
}

/**
 * The hostnames nothing has claimed, which is what a simulation with no such
 * resources resolves with.
 */
export class SimAwsNoServiceHosts implements SimAwsServiceHosts {
  /**
   * Resolve nothing, because no resource has claimed a hostname of its own.
   */
  targetForHost(): undefined {
    return;
  }
}
