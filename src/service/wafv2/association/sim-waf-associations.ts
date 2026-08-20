import type { SimWafDecision } from "../evaluate/sim-waf-decision.js";
import { simWafInspectedRequest } from "../evaluate/sim-waf-inspected-request.js";
import type { SimWafWebAcl } from "../web-acl/sim-waf-web-acl.js";
import type {
  SimWafProtectedRequest,
  SimWafProtection,
} from "./sim-waf-protection.js";

/**
 * The web ACLs one Account and Region has in front of things.
 *
 * A resource carries at most one web ACL, which is why this is keyed by
 * resource ARN. The web ACL itself is held rather than its ARN, so a request
 * reaching a protected resource is evaluated without a second lookup, and so a
 * web ACL cannot be deleted out from under a resource still pointing at it.
 */
export class SimWafAssociations implements SimWafProtection {
  readonly #webAcls = new Map<string, SimWafWebAcl>();

  /**
   * Put a web ACL in front of one resource, replacing whatever was there.
   *
   * AssociateWebACL overwrites rather than refusing, because a resource has
   * one web ACL and pointing it at another is how it is changed.
   */
  associate(resourceArn: string, webAcl: SimWafWebAcl): void {
    this.#webAcls.set(resourceArn, webAcl);
  }

  /**
   * The web ACL in front of one resource, or nothing when it has none.
   */
  webAclFor(resourceArn: string): SimWafWebAcl | undefined {
    return this.#webAcls.get(resourceArn);
  }

  /**
   * The resources one web ACL is in front of, in the order they were
   * associated.
   */
  resourceArnsFor(webAcl: SimWafWebAcl): readonly string[] {
    return this.#webAcls
      .entries()
      .filter(([, associated]) => associated === webAcl)
      .map(([resourceArn]) => resourceArn)
      .toArray();
  }

  /**
   * Whether a web ACL is in front of one resource.
   */
  protects(resourceArn: string): boolean {
    return this.#webAcls.has(resourceArn);
  }

  /**
   * What the web ACL in front of one resource decides about a request.
   */
  decide(request: SimWafProtectedRequest): SimWafDecision | undefined {
    const webAcl = this.#webAcls.get(request.resourceArn);

    if (webAcl === undefined) {
      return undefined;
    }

    return webAcl.evaluate(
      simWafInspectedRequest(request.request, request.body),
    );
  }

  /**
   * Forget whatever is in front of one resource.
   *
   * This is both what DisassociateWebACL does and what deleting the resource
   * does. A stage that is deleted and created again under the same name is
   * unprotected, as it is on AWS.
   */
  release(resourceArn: string): void {
    this.#webAcls.delete(resourceArn);
  }
}
