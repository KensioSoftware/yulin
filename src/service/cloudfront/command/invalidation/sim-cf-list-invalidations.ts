import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { simCfInvalidationSummary } from "../../invalidation/sim-cf-invalidation-view.js";
import type { SimCfInvalidationAccess } from "./sim-cf-invalidation-access.js";
import type {
  SimListInvalidationsCommand,
  SimListInvalidationsCommandOutput,
} from "./sim-cf-invalidation-command.types.js";

/**
 * What CloudFront reports as `MaxItems` for a listing that asks for none.
 */
const defaultMaxItems = 100;

/**
 * Simulated CloudFront ListInvalidations command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudfront/command/ListInvalidationsCommand/
 */
export class SimCfListInvalidations {
  private static readonly action = "cloudfront:ListInvalidations";

  constructor(private readonly access: SimCfInvalidationAccess) {}

  /**
   * List a Distribution's invalidations, most recently created first.
   *
   * The whole list comes back. `Marker` and `MaxItems` are the paging every
   * other simulated listing leaves out, so the answer is never truncated and
   * carries no `NextMarker`.
   */
  async handle(
    command: SimListInvalidationsCommand,
    options?: { readonly caller?: SimAwsCaller },
  ): Promise<SimListInvalidationsCommandOutput> {
    await this.access.background.sequence();

    const distribution = this.access.authorizedDistribution(
      SimCfListInvalidations.action,
      command.input.DistributionId,
      options?.caller,
    );
    const invalidations = distribution.invalidations.newestFirst();

    return {
      InvalidationList: {
        Marker: command.input.Marker ?? "",
        MaxItems: command.input.MaxItems ?? defaultMaxItems,
        IsTruncated: false,
        Quantity: invalidations.length,
        Items: invalidations.map((invalidation) =>
          simCfInvalidationSummary(invalidation),
        ),
      },
      $metadata: {},
    };
  }
}
