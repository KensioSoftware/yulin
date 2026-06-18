import type { CommandHandler } from "../../../../command/command-handler.js";
import type {
  SimCreateDistributionCommand,
  SimCreateDistributionCommandOutput,
} from "./create-distribution.cmd.js";
import type { SimCloudFrontRegistry } from "../../sim-cloud-front-registry.js";
import {
  SimCloudFrontDistribution,
  type SimCloudFrontDistributionId,
} from "../../distribution/sim-cloudfront-distribution.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCloudFrontS3OriginResolver } from "../../origin/sim-cloudfront-s3-origin.js";
import type { BackgroundScheduler } from "../../../../util/background/background.js";
import { SimCloudFrontOriginConfigurator } from "../../distribution/configurator/sim-cloud-front-origin-configurator.js";
import { SimCloudFrontBehaviorConfigurator } from "../../distribution/configurator/sim-cloud-front-behavior-configurator.js";
import { SimCloudFrontDistributionConfigurator } from "../../distribution/configurator/sim-cloud-front-distribution-configurator.js";

interface CreateDistributionCommandHandlerProps {
  readonly accountId: SimAwsAccountId;
  readonly distributions: Map<
    SimCloudFrontDistributionId,
    SimCloudFrontDistribution
  >;
  readonly cloudFrontRegistry: SimCloudFrontRegistry;
  readonly s3OriginResolver: SimCloudFrontS3OriginResolver;
  readonly background: BackgroundScheduler;
}

/**
 * CloudFront CreateDistributionCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudfront/command/CreateDistributionCommand/
 */
export class CreateDistributionCommandHandler implements CommandHandler<
  SimCreateDistributionCommand,
  SimCreateDistributionCommandOutput
> {
  private readonly accountId: SimAwsAccountId;
  private readonly distributions: Map<
    SimCloudFrontDistributionId,
    SimCloudFrontDistribution
  >;
  private readonly cloudFrontRegistry: SimCloudFrontRegistry;
  private readonly distributionConfigurator: SimCloudFrontDistributionConfigurator;
  private readonly background: BackgroundScheduler;

  constructor(props: CreateDistributionCommandHandlerProps) {
    this.accountId = props.accountId;
    this.distributions = props.distributions;
    this.cloudFrontRegistry = props.cloudFrontRegistry;
    this.distributionConfigurator = new SimCloudFrontDistributionConfigurator(
      new SimCloudFrontOriginConfigurator(props.s3OriginResolver),
      new SimCloudFrontBehaviorConfigurator(),
    );
    this.background = props.background;
  }

  /**
   * Handle creation of a new CloudFront Distribution.
   */
  async handle(
    cmd: SimCreateDistributionCommand,
  ): Promise<SimCreateDistributionCommandOutput> {
    const distributionConfig = cmd.input.DistributionConfig;
    assertDefined(
      distributionConfig,
      "CreateDistributionCommand.DistributionConfig",
    );

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const distributionId = this.cloudFrontRegistry.allocateDistributionId();
    const distribution = new SimCloudFrontDistribution({
      distributionId,
      distributionConfig,
      status: "Deploying",
      accountId: this.accountId,
    });

    this.distributionConfigurator.configure(distribution, distributionConfig);

    this.distributions.set(distribution.distributionId, distribution);
    this.cloudFrontRegistry.registerDistribution(
      distribution.distributionId,
      this.accountId,
    );

    // Schedule background task to complete deployment of the sim Distribution.
    this.background.schedule(() => distribution.completeDeployment());

    return {
      Distribution: {
        Id: distribution.distributionId,
        ARN: `arn:aws:cloudfront::${this.accountId}:distribution/${distribution.distributionId}`,
        Status: distribution.status,
        LastModifiedTime: distribution.lastModifiedTime,
        InProgressInvalidationBatches: 0,
        DomainName: `${distribution.distributionId.toLowerCase()}.cloudfront.net`,
        DistributionConfig: distribution.distributionConfig,
      },
      Location: `https://cloudfront.amazonaws.com/2020-05-31/distribution/${distribution.distributionId}`,
      $metadata: {},
    };
  }
}
