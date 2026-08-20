import type { SimWafProtectedResource } from "./sim-waf-protected-resource.js";

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
   */
  has(resource: SimWafProtectedResource): boolean;
}

/**
 * The resources available to a WAFv2 with nothing around it to ask.
 *
 * Every ARN resolves to nothing, so a standalone simulated WAFv2 associates a
 * web ACL with nothing at all. That is the safe answer: an association held
 * against a resource no request will ever reach protects nothing, and saying
 * so is better than reporting a web ACL in front of something imaginary.
 */
export class SimWafNoProtectedResources implements SimWafProtectedResources {
  /**
   * No resource is reachable here.
   */
  has(): boolean {
    return false;
  }
}
