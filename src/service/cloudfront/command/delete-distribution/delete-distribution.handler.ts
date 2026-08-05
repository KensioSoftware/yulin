import type { CommandHandler } from "../../../../command/command-handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type {
  SimCloudFrontDistribution,
  SimCloudFrontDistributionId,
} from "../../distribution/sim-cloudfront-distribution.js";
import { SimCloudFrontNoSuchDistribution } from "../../error/sim-cloudfront.error.js";
import type { SimCloudFrontRegistry } from "../../registry/sim-cloud-front-registry.js";
import { DeleteDistributionAuthorizer } from "./delete-distribution-authorizer.js";
import type {
  SimDeleteDistributionCommand,
  SimDeleteDistributionCommandOutput,
} from "./delete-distribution.command.js";

interface DeleteDistributionCommandHandlerProperties {
  readonly accountId: SimAwsAccountId;
  readonly distributions: Map<
    SimCloudFrontDistributionId,
    SimCloudFrontDistribution
  >;
  readonly cloudFrontRegistry: SimCloudFrontRegistry;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

interface DeleteDistributionCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * CloudFront DeleteDistributionCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudfront/command/DeleteDistributionCommand/
 */
export class DeleteDistributionCommandHandler implements CommandHandler<
  SimDeleteDistributionCommand,
  SimDeleteDistributionCommandOutput
> {
  private readonly distributions: Map<
    SimCloudFrontDistributionId,
    SimCloudFrontDistribution
  >;
  private readonly cloudFrontRegistry: SimCloudFrontRegistry;
  private readonly authorizer: DeleteDistributionAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: DeleteDistributionCommandHandlerProperties) {
    const {
      accountId,
      distributions,
      cloudFrontRegistry,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    this.distributions = distributions;
    this.cloudFrontRegistry = cloudFrontRegistry;
    this.authorizer = new DeleteDistributionAuthorizer({ accountId, iam });
    this.background = background;
  }

  /**
   * Handle deleting a CloudFront Distribution.
   *
   * The Distribution has to be disabled first, as it does in AWS, so a Stack
   * teardown that forgets fails here the way it fails there.
   *
   * Real CloudFront also takes an `IfMatch` ETag from the preceding read and
   * answers PreconditionFailed or InvalidIfMatchVersion when it is wrong or
   * missing. That is not modelled: `IfMatch` is accepted and ignored. Nothing
   * else in this simulator versions a resource, and a stale ETag is a retry
   * rather than a design mistake, so the concept would cost every CloudFront
   * command for very little. A test expecting the ETag refusal will not get
   * it.
   */
  async handle(
    command: SimDeleteDistributionCommand,
    options?: DeleteDistributionCommandHandlerOptions,
  ): Promise<SimDeleteDistributionCommandOutput> {
    assertDefined(command.input.Id, "DeleteDistributionCommand.input.Id");
    const distributionId = command.input.Id as SimCloudFrontDistributionId;

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    this.authorizer.authorize(distributionId, options?.caller);

    const distribution = this.distributions.get(distributionId);

    if (distribution === undefined) {
      throw new SimCloudFrontNoSuchDistribution(
        `No sim CloudFront Distribution with ID ${distributionId}`,
      );
    }

    distribution.assertDeletable();

    this.distributions.delete(distributionId);
    this.cloudFrontRegistry.deregisterDistribution(distributionId);

    return { $metadata: { httpStatusCode: 204 } };
  }
}
