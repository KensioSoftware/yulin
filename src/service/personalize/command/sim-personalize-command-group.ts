import type { SimClock } from "../../../util/clock/sim-clock.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimPersonalizeResource } from "../resource/sim-personalize-resource.js";
import type { SimPersonalizeResourceStore } from "../resource/sim-personalize-resource-store.js";
import type { SimPersonalizeResources } from "../resource/sim-personalize-resources.js";
import type { SimPersonalizeAuthorizer } from "./authorize/sim-personalize-authorizer.js";
import type { SimPersonalizeRequestOptions } from "./sim-personalize-request-options.js";

export interface SimPersonalizeCommandGroupProperties {
  readonly resources: SimPersonalizeResources;
  readonly authorizer: SimPersonalizeAuthorizer;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly clock: SimClock;
}

/**
 * What every simulated Personalize command group is built over.
 *
 * The six groups take the same four collaborators and reach a named resource
 * the same way, so both live here rather than six times over.
 */
export abstract class SimPersonalizeCommandGroup {
  protected readonly resources: SimPersonalizeResources;
  protected readonly authorizer: SimPersonalizeAuthorizer;
  protected readonly accountRegionScope: SimAwsAccountRegionScope;
  protected readonly clock: SimClock;

  constructor(properties: SimPersonalizeCommandGroupProperties) {
    this.resources = properties.resources;
    this.authorizer = properties.authorizer;
    this.accountRegionScope = properties.accountRegionScope;
    this.clock = properties.clock;
  }

  /**
   * Read an ARN from request input, authorize the caller against it, and
   * resolve the resource it names.
   *
   * The order matters. Authorizing before resolving means a caller with no
   * permission learns only that it has no permission, and the existence of the
   * resource stays hidden.
   */
  protected resolve<T extends SimPersonalizeResource>(
    store: SimPersonalizeResourceStore<T>,
    arn: string | undefined,
    action: string,
    options: SimPersonalizeRequestOptions | undefined,
  ): T {
    const resolved = store.requireArn(arn);

    this.authorizer.authorize(action, options, resolved);

    return store.require(resolved);
  }
}
