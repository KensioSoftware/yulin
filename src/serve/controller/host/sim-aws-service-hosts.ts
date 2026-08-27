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

/**
 * The hostnames claimed by any of several holders, asked in turn.
 *
 * More than one simulated service hands out hostnames of its own choosing: a
 * Cognito user pool domain and an API Gateway custom domain are both names the
 * project picked rather than names AWS generated. Resolution asks one thing
 * about a hostname, so the holders are gathered here rather than each being
 * threaded separately through it.
 *
 * Resolution asks twice. A hosted-zone record outranks some claims and leaves
 * others alone, and which of these a holder is gathered into is what says when
 * the hostnames it holds are answered for.
 */
export class SimAwsAnyServiceHosts implements SimAwsServiceHosts {
  private readonly holders: readonly SimAwsServiceHosts[];

  constructor(holders: readonly SimAwsServiceHosts[]) {
    this.holders = holders;
  }

  /**
   * The first target any holder claims for a hostname.
   */
  targetForHost(hostname: string): SimAwsServiceTarget | undefined {
    for (const holder of this.holders) {
      const target = holder.targetForHost(hostname);

      if (target !== undefined) {
        return target;
      }
    }

    return undefined;
  }
}
