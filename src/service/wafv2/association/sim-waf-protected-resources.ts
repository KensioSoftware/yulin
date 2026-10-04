import type { SimWafProtectedResource } from "./sim-waf-protected-resource.js";
import { SimWafUnsimulatedResource } from "./sim-waf-unsimulated-resource.js";

/**
 * The resources of one Account and Region a web ACL can be put in front of.
 *
 * An association names a resource that has to be there. WAFv2 holds no API
 * Gateway state of its own, so this is how it asks whichever service owns the
 * resource whether the ARN names anything.
 */
export interface SimWafProtectedResources {
  /**
   * Whether this simulation holds the resource an ARN names.
   *
   * A `SimWafUnsimulatedResource` is held by no simulated service, so there is
   * nothing to look for, and it is taken as named.
   */
  has(resource: SimWafProtectedResource): boolean;
}

/**
 * The resources available to a WAFv2 with nothing around it to ask.
 *
 * Every simulated resource ARN resolves to nothing, so a standalone simulated
 * WAFv2 associates a web ACL with no stage or pool. That is the safe answer:
 * an association held against a resource no request will ever reach protects
 * nothing, and saying so is better than reporting a web ACL in front of
 * something imaginary. A `SimWafUnsimulatedResource` is taken as named here
 * as everywhere else.
 */
export class SimWafNoProtectedResources implements SimWafProtectedResources {
  /**
   * Whether the resource is one no simulated service holds.
   */
  has(resource: SimWafProtectedResource): boolean {
    return resource instanceof SimWafUnsimulatedResource;
  }
}
