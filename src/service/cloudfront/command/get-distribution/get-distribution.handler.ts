import type {
  SimGetDistributionCommand,
  SimGetDistributionCommandOutput,
} from "./get-distribution.command.js";
import type { CommandHandler } from "../../../../command/command-handler.js";
import type {
  SimCloudFrontDistribution,
  SimCloudFrontDistributionId,
} from "../../distribution/sim-cloudfront-distribution.js";
import { SimCloudFrontResourceNotFoundException } from "../../error/sim-cloudfront.error.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { GetDistributionAuthorizer } from "./get-distribution-authorizer.js";

interface GetDistributionCommandHandlerProperties {
  readonly accountId: SimAwsAccountId;
  readonly distributions: Map<
    SimCloudFrontDistributionId,
    SimCloudFrontDistribution
  >;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

interface GetDistributionCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * CloudFront GetDistributionCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudfront/command/GetDistributionCommand/
 */
export class GetDistributionCommandHandler implements CommandHandler<
  SimGetDistributionCommand,
  SimGetDistributionCommandOutput
> {
  private readonly distributions: Map<
    SimCloudFrontDistributionId,
    SimCloudFrontDistribution
  >;
  private readonly authorizer: GetDistributionAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: GetDistributionCommandHandlerProperties) {
    const {
      accountId,
      distributions,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;
    this.distributions = distributions;
    this.authorizer = new GetDistributionAuthorizer({
      accountId,
      iam,
    });
    this.background = background;
  }

  /**
   * Handle getting a CloudFront Distribution.
   */
  async handle(
    command: SimGetDistributionCommand,
    options?: GetDistributionCommandHandlerOptions,
  ): Promise<SimGetDistributionCommandOutput> {
    assertDefined(command.input.Id, "GetDistributionCommand.input.Id");
    const distributionId = command.input.Id as SimCloudFrontDistributionId;

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    this.authorizer.authorize(distributionId, options?.caller);

    const distribution = this.distributions.get(distributionId);
    if (distribution === undefined) {
      throw new SimCloudFrontResourceNotFoundException(
        `No sim CloudFront Distribution with ID ${distributionId}`,
      );
    }

    return {
      Distribution: {
        Id: distribution.distributionId,
        ARN: `arn:aws:cloudfront::${distribution.accountId}:distribution/${distribution.distributionId}`,
        Status: distribution.status,
        LastModifiedTime: distribution.lastModifiedTime,
        InProgressInvalidationBatches: 0,
        DomainName: `${distribution.distributionId.toLowerCase()}.cloudfront.net`,
        DistributionConfig: distribution.distributionConfig,
      },
      $metadata: {},
    };
  }
}
