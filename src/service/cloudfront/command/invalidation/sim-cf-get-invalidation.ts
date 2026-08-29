import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimCloudFrontNoSuchInvalidation } from "../../error/sim-cf-invalidation.error.js";
import { simCfInvalidationView } from "../../invalidation/sim-cf-invalidation-view.js";
import type { SimCfInvalidationAccess } from "./sim-cf-invalidation-access.js";
import type {
  SimGetInvalidationCommand,
  SimGetInvalidationCommandOutput,
} from "./sim-cf-invalidation-command.types.js";

/**
 * Simulated CloudFront GetInvalidation command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudfront/command/GetInvalidationCommand/
 */
export class SimCfGetInvalidation {
  private static readonly action = "cloudfront:GetInvalidation";

  constructor(private readonly access: SimCfInvalidationAccess) {}

  /**
   * Read one invalidation of a Distribution back.
   */
  async handle(
    command: SimGetInvalidationCommand,
    options?: { readonly caller?: SimAwsCaller },
  ): Promise<SimGetInvalidationCommandOutput> {
    const invalidationId = command.input.Id;
    assertDefined(invalidationId, "GetInvalidationCommand.Id");

    await this.access.background.sequence();

    const distribution = this.access.authorizedDistribution(
      SimCfGetInvalidation.action,
      command.input.DistributionId,
      options?.caller,
    );
    const invalidation = distribution.invalidations.byId(invalidationId);

    if (invalidation === undefined) {
      throw new SimCloudFrontNoSuchInvalidation(
        `No sim CloudFront invalidation with ID ${invalidationId} on Distribution ${distribution.distributionId}`,
      );
    }

    return {
      Invalidation: simCfInvalidationView(invalidation),
      $metadata: {},
    };
  }
}
