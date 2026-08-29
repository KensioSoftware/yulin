import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type {
  SimCloudFrontDistribution,
  SimCloudFrontDistributionId,
} from "../../distribution/sim-cloudfront-distribution.js";
import { SimCfCreateInvalidation } from "./sim-cf-create-invalidation.js";
import { SimCfGetInvalidation } from "./sim-cf-get-invalidation.js";
import { SimCfInvalidationAccess } from "./sim-cf-invalidation-access.js";
import { SimCfListInvalidations } from "./sim-cf-list-invalidations.js";
import type {
  SimCreateInvalidationCommand,
  SimCreateInvalidationCommandOutput,
  SimGetInvalidationCommand,
  SimGetInvalidationCommandOutput,
  SimListInvalidationsCommand,
  SimListInvalidationsCommandOutput,
} from "./sim-cf-invalidation-command.types.js";

interface SimCfInvalidationCommandsProperties {
  readonly accountId: SimAwsAccountId;
  readonly distributions: Map<
    SimCloudFrontDistributionId,
    SimCloudFrontDistribution
  >;
  readonly iam: SimIamInterServiceAuthZ;
  readonly background: BackgroundScheduler;
}

interface InvalidationRequestOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The invalidation commands on the CloudFront client.
 *
 * They are grouped here, the way the Function commands are, because all three
 * work on state a Distribution holds of its own and share the lookup that
 * reaches it.
 */
export class SimCfInvalidationCommands {
  private readonly access: SimCfInvalidationAccess;

  constructor(properties: SimCfInvalidationCommandsProperties) {
    this.access = new SimCfInvalidationAccess(properties);
  }

  /**
   * Handle a Create Invalidation Command from the SDK.
   */
  async createInvalidation(
    command: SimCreateInvalidationCommand,
    options?: InvalidationRequestOptions,
  ): Promise<SimCreateInvalidationCommandOutput> {
    return await new SimCfCreateInvalidation(this.access).handle(
      command,
      options,
    );
  }

  /**
   * Handle a Get Invalidation Command from the SDK.
   */
  async getInvalidation(
    command: SimGetInvalidationCommand,
    options?: InvalidationRequestOptions,
  ): Promise<SimGetInvalidationCommandOutput> {
    return await new SimCfGetInvalidation(this.access).handle(command, options);
  }

  /**
   * Handle a List Invalidations Command from the SDK.
   */
  async listInvalidations(
    command: SimListInvalidationsCommand,
    options?: InvalidationRequestOptions,
  ): Promise<SimListInvalidationsCommandOutput> {
    return await new SimCfListInvalidations(this.access).handle(
      command,
      options,
    );
  }
}
