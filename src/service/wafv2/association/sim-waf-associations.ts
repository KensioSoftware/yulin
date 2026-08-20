import type { SimWafDecision } from "../evaluate/sim-waf-decision.js";
import { simWafInspectedRequest } from "../evaluate/sim-waf-inspected-request.js";
import type { SimWafWebAcl } from "../web-acl/sim-waf-web-acl.js";
import type {
  SimWafProtectedResource,
  SimWafProtectedResourceType,
} from "./sim-waf-protected-resource.js";
import type {
  SimWafProtectedRequest,
  SimWafProtection,
} from "./sim-waf-protection.js";

/**
 * One web ACL in front of one resource.
 *
 * The resource type is held with it because `ListResourcesForWebACL` lists one
 * type at a time, and the ARN alone would have to be read again to say which
 * type it named.
 */
interface SimWafAssociation {
  readonly webAcl: SimWafWebAcl;
  readonly resourceType: SimWafProtectedResourceType;
}

/**
 * The web ACLs one Account and Region has in front of things.
 *
 * A resource carries at most one web ACL, which is why this is keyed by
 * resource ARN. The web ACL itself is held rather than its ARN, so a request
 * reaching a protected resource is evaluated without a second lookup, and so a
 * web ACL cannot be deleted out from under a resource still pointing at it.
 */
export class SimWafAssociations implements SimWafProtection {
  readonly #associations = new Map<string, SimWafAssociation>();

  /**
   * Put a web ACL in front of one resource, replacing whatever was there.
   *
   * AssociateWebACL overwrites rather than refusing, because a resource has
   * one web ACL and pointing it at another is how it is changed.
   */
  associate(resource: SimWafProtectedResource, webAcl: SimWafWebAcl): void {
    this.#associations.set(resource.arn, {
      webAcl,
      resourceType: resource.resourceType,
    });
  }

  /**
   * The web ACL in front of one resource, or nothing when it has none.
   */
  webAclFor(resourceArn: string): SimWafWebAcl | undefined {
    return this.#associations.get(resourceArn)?.webAcl;
  }

  /**
   * The resources one web ACL is in front of, in the order they were
   * associated.
   *
   * A resource type narrows the answer to the resources of that type, as
   * `ListResourcesForWebACL` does. Naming none answers with all of them, which
   * is what `DeleteWebACL` asks for when it refuses a web ACL still in use.
   */
  resourceArnsFor(
    webAcl: SimWafWebAcl,
    resourceType?: SimWafProtectedResourceType,
  ): readonly string[] {
    return this.#associations
      .entries()
      .filter(([, association]) => association.webAcl === webAcl)
      .filter(
        ([, association]) =>
          resourceType === undefined ||
          association.resourceType === resourceType,
      )
      .map(([resourceArn]) => resourceArn)
      .toArray();
  }

  /**
   * Whether a web ACL is in front of one resource.
   */
  protects(resourceArn: string): boolean {
    return this.#associations.has(resourceArn);
  }

  /**
   * What the web ACL in front of one resource decides about a request.
   */
  decide(request: SimWafProtectedRequest): SimWafDecision | undefined {
    const association = this.#associations.get(request.resourceArn);

    if (association === undefined) {
      return undefined;
    }

    return association.webAcl.evaluate(
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
    this.#associations.delete(resourceArn);
  }
}
