import type { CommandHandler } from "../../../../command/command-handler.js";
import type {
  SimCloudFrontCacheBehaviorConfig,
  SimCloudFrontDefaultCacheBehaviorConfig,
  SimCloudFrontDistributionConfig,
  SimCloudFrontMethodList,
  SimCloudFrontOriginConfig,
  SimCreateDistributionCommand,
  SimCreateDistributionCommandOutput,
} from "./create-distribution.cmd.js";
import type { SimCloudFrontRegistry } from "../../sim-cloud-front-registry.js";
import { jitter } from "../../../../util/sleep.js";
import {
  SimCloudFrontDistribution,
  type SimCloudFrontDistributionId,
} from "../../distribution/sim-cloudfront-distribution.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import type { SimCloudFrontBehavior } from "../../behaviour/sim-cloud-front-behavior.js";
import { assertDefined } from "../../../../util/defined/defined.js";
import {
  SimCloudFrontS3Origin,
  type SimCloudFrontS3OriginResolver,
} from "../../origin/sim-cloudfront-s3-origin.js";
import type { BackgroundScheduler } from "../../../../util/background/background.js";

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
  private readonly s3OriginResolver: SimCloudFrontS3OriginResolver;
  private readonly background: BackgroundScheduler;

  constructor(props: CreateDistributionCommandHandlerProps) {
    this.accountId = props.accountId;
    this.distributions = props.distributions;
    this.cloudFrontRegistry = props.cloudFrontRegistry;
    this.s3OriginResolver = props.s3OriginResolver;
    this.background = props.background;
  }

  /**
   * Handle creation of a new CloudFront Distribution.
   */
  async handle(
    cmd: SimCreateDistributionCommand,
  ): Promise<SimCreateDistributionCommandOutput> {
    await jitter();

    const distributionConfig = cmd.input.DistributionConfig;
    assertDefined(
      distributionConfig,
      "CreateDistributionCommand.DistributionConfig",
    );

    const distributionId = this.cloudFrontRegistry.allocateDistributionId();
    const distribution = new SimCloudFrontDistribution({
      distributionId,
      distributionConfig,
      status: "Deploying",
      accountId: this.accountId,
    });

    this.configureDistribution(distribution, distributionConfig);

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

  private configureDistribution(
    distribution: SimCloudFrontDistribution,
    distributionConfig: SimCloudFrontDistributionConfig,
  ): void {
    for (const alias of distributionConfig.Aliases?.Items ?? []) {
      distribution.addAlternateDomainName(alias);
    }

    for (const origin of distributionConfig.Origins?.Items ?? []) {
      this.configureOrigin(distribution, origin);
    }

    distribution.addBehavior(
      this.behaviorFromDefaultCacheBehavior(
        distributionConfig.DefaultCacheBehavior,
      ),
    );

    for (const cacheBehavior of distributionConfig.CacheBehaviors?.Items ??
      []) {
      distribution.addBehavior(this.behaviorFromCacheBehavior(cacheBehavior));
    }
  }

  private configureOrigin(
    distribution: SimCloudFrontDistribution,
    origin: SimCloudFrontOriginConfig,
  ): void {
    assertDefined(origin.Id, "CloudFront Origin Id");
    assertDefined(origin.DomainName, "CloudFront Origin DomainName");

    if (origin.S3OriginConfig !== undefined) {
      const bucket = this.s3OriginResolver(origin.DomainName);

      assertDefined(
        bucket,
        `Sim S3 Bucket for CloudFront Origin ${origin.DomainName}`,
      );

      distribution.addOrigin(
        origin.Id,
        new SimCloudFrontS3Origin({ bucket, originPath: origin.OriginPath }),
      );
      return;
    }

    throw new Error(
      `Unsupported sim CloudFront Origin type for Origin ${origin.Id}`,
    );
  }

  private behaviorFromDefaultCacheBehavior(
    cacheBehavior: SimCloudFrontDefaultCacheBehaviorConfig | undefined,
  ): SimCloudFrontBehavior {
    assertDefined(cacheBehavior, "CloudFront DefaultCacheBehavior");

    return {
      targetOriginName: this.requiredTargetOriginId(
        cacheBehavior.TargetOriginId,
      ),
      allowedMethods: this.methods(cacheBehavior.AllowedMethods, [
        "GET",
        "HEAD",
      ]),
      cachedMethods: this.methods(cacheBehavior.AllowedMethods?.CachedMethods, [
        "GET",
        "HEAD",
      ]),
      ...(cacheBehavior.ViewerProtocolPolicy === undefined
        ? {}
        : { viewerProtocolPolicy: cacheBehavior.ViewerProtocolPolicy }),
    };
  }

  private behaviorFromCacheBehavior(
    cacheBehavior: SimCloudFrontCacheBehaviorConfig,
  ): SimCloudFrontBehavior {
    assertDefined(
      cacheBehavior.PathPattern,
      "CloudFront CacheBehavior PathPattern",
    );

    return {
      pathPattern: cacheBehavior.PathPattern,
      targetOriginName: this.requiredTargetOriginId(
        cacheBehavior.TargetOriginId,
      ),
      allowedMethods: this.methods(cacheBehavior.AllowedMethods, [
        "GET",
        "HEAD",
      ]),
      cachedMethods: this.methods(cacheBehavior.AllowedMethods?.CachedMethods, [
        "GET",
        "HEAD",
      ]),
      ...(cacheBehavior.ViewerProtocolPolicy === undefined
        ? {}
        : { viewerProtocolPolicy: cacheBehavior.ViewerProtocolPolicy }),
    };
  }

  private requiredTargetOriginId(targetOriginId: string | undefined): string {
    assertDefined(targetOriginId, "CloudFront CacheBehavior TargetOriginId");

    return targetOriginId;
  }

  private methods(
    methods: SimCloudFrontMethodList | undefined,
    fallback: string[],
  ): Set<string> {
    return new Set(methods?.Items ?? fallback);
  }
}
