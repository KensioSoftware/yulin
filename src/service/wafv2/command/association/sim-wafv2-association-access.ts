import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimWafProtectedResource } from "../../association/sim-waf-protected-resource.js";
import type { SimWafProtectedResources } from "../../association/sim-waf-protected-resources.js";
import { SimWafUnavailableEntityException } from "../../error/sim-wafv2.error.js";
import type { SimWafResourceStore } from "../../resource/sim-waf-resource-store.js";
import type { SimWafWebAcl } from "../../web-acl/sim-waf-web-acl.js";
import type { SimWafAuthorizer } from "../authorize/sim-wafv2-authorizer.js";
import { simWafAssociationResource } from "./sim-wafv2-association-input.js";
import { requireRegionalSimWafWebAcl } from "./sim-wafv2-regional-web-acl.js";

interface SimWafAssociationAccessProperties {
  readonly webAcls: SimWafResourceStore<SimWafWebAcl>;
  readonly protectedResources: SimWafProtectedResources;
  readonly authorizer: SimWafAuthorizer;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * Reaching the two things an association names, in the order AWS reaches them.
 *
 * Authorizing comes before the lookup here as it does everywhere else in this
 * service. A caller with no permission for a stage never learns whether the
 * stage is there.
 */
export class SimWafAssociationAccess {
  readonly #webAcls: SimWafResourceStore<SimWafWebAcl>;
  readonly #protectedResources: SimWafProtectedResources;
  readonly #authorizer: SimWafAuthorizer;
  readonly #accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimWafAssociationAccessProperties) {
    this.#webAcls = properties.webAcls;
    this.#protectedResources = properties.protectedResources;
    this.#authorizer = properties.authorizer;
    this.#accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Authorize a caller for an action naming one web ACL by ARN.
   */
  authorizeWebAcl(action: string, arn: string, caller?: SimAwsCaller): void {
    this.#authorizer.authorizeResource(action, arn, caller);
  }

  /**
   * Read the resource ARN a command carries, without authorizing for it.
   *
   * AssociateWebACL authorizes against the web ACL. The resource ARN is still
   * read first, so a request naming both of them badly is refused for the ARN
   * it wrote rather than for the one IAM happened to see.
   */
  resource(resourceArn: string | undefined): SimWafProtectedResource {
    return simWafAssociationResource(resourceArn, this.#accountRegionScope);
  }

  /**
   * Read a resource ARN, authorize the caller for it, and check it is there.
   *
   * This is for the two commands carrying only a resource ARN. The web ACL
   * they are about is whatever the association turns out to hold, so the
   * resource is the only thing IAM has to decide against.
   */
  authorizedResource(
    resourceArn: string | undefined,
    action: string,
    caller?: SimAwsCaller,
  ): SimWafProtectedResource {
    const resource = this.resource(resourceArn);

    this.#authorizer.authorizeResource(action, resource.arn, caller);
    this.requireResource(resource);

    return resource;
  }

  /**
   * Ensure the resource an association names is one this simulation holds.
   */
  requireResource(resource: SimWafProtectedResource): void {
    if (!this.#protectedResources.has(resource)) {
      throw new SimWafUnavailableEntityException(
        `AWS WAF couldn't retrieve the resource that you requested. Retry ` +
          `your request: ${resource.arn}.`,
      );
    }
  }

  /**
   * Get the `REGIONAL` web ACL an ARN names.
   */
  webAcl(webAclArn: string): SimWafWebAcl {
    return requireRegionalSimWafWebAcl({
      webAclArn,
      webAcls: this.#webAcls,
      accountRegionScope: this.#accountRegionScope,
    });
  }
}
