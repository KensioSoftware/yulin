import type { CommandHandler } from "../../../../command/command-handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimAcmRegistry } from "../../../acm/registry/sim-acm-registry.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimCloudFrontDistributionReconfigurer } from "../../distribution/sim-cf-distribution-reconfigurer.js";
import { simCloudFrontDistributionView } from "../../distribution/sim-cf-distribution-view.js";
import type {
  SimCloudFrontDistribution,
  SimCloudFrontDistributionId,
} from "../../distribution/sim-cloudfront-distribution.js";
import { SimCloudFrontViewerCertificateValidator } from "../../distribution/viewer-certificate/sim-cf-viewer-certificate-validator.js";
import { SimCloudFrontNoSuchDistribution } from "../../error/sim-cloudfront.error.js";
import type { SimCfCustomOriginDispatcher } from "../../origin/custom/sim-cf-custom-origin-dispatcher.js";
import type { SimCloudFrontS3OriginResolver } from "../../origin/s3/sim-cloudfront-s3-origin.js";
import type { SimCloudFrontRegistry } from "../../registry/sim-cloud-front-registry.js";
import { SimCloudFrontDistributionConfigNormalizer } from "../create-distribution/sim-cf-distro-config-normalizer.js";
import { UpdateDistributionAuthorizer } from "./update-distribution-authorizer.js";
import type {
  SimUpdateDistributionCommand,
  SimUpdateDistributionCommandOutput,
} from "./update-distribution.command.js";

interface UpdateDistributionCommandHandlerProperties {
  readonly accountId: SimAwsAccountId;
  readonly distributions: Map<
    SimCloudFrontDistributionId,
    SimCloudFrontDistribution
  >;
  readonly cloudFrontRegistry: SimCloudFrontRegistry;
  readonly s3OriginResolver: SimCloudFrontS3OriginResolver;
  readonly customOriginDispatcher?: SimCfCustomOriginDispatcher | undefined;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly acmRegistry?: SimAcmRegistry | undefined;
  readonly background?: BackgroundScheduler;
}

interface UpdateDistributionCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * CloudFront UpdateDistributionCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudfront/command/UpdateDistributionCommand/
 */
export class UpdateDistributionCommandHandler implements CommandHandler<
  SimUpdateDistributionCommand,
  SimUpdateDistributionCommandOutput
> {
  private readonly distributions: Map<
    SimCloudFrontDistributionId,
    SimCloudFrontDistribution
  >;
  private readonly reconfigurer: SimCloudFrontDistributionReconfigurer;
  private readonly viewerCertificateValidator: SimCloudFrontViewerCertificateValidator;
  private readonly authorizer: UpdateDistributionAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: UpdateDistributionCommandHandlerProperties) {
    const {
      accountId,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    this.distributions = properties.distributions;
    this.reconfigurer = new SimCloudFrontDistributionReconfigurer(properties);
    this.viewerCertificateValidator =
      new SimCloudFrontViewerCertificateValidator(properties);
    this.authorizer = new UpdateDistributionAuthorizer({ accountId, iam });
    this.background = background;
  }

  /**
   * Handle updating a CloudFront Distribution.
   *
   * The `IfMatch` ETag is accepted and not checked. Nothing else in this
   * simulator versions a resource, and a stale ETag is a retry rather than a
   * design mistake, so the concept would cost every CloudFront command for
   * very little. A test expecting PreconditionFailed will not get it.
   */
  async handle(
    command: SimUpdateDistributionCommand,
    options?: UpdateDistributionCommandHandlerOptions,
  ): Promise<SimUpdateDistributionCommandOutput> {
    const { Id: id, DistributionConfig: config } = command.input;
    assertDefined(id, "UpdateDistributionCommand.input.Id");
    assertDefined(config, "UpdateDistributionCommand.input.DistributionConfig");

    const distributionId = id as SimCloudFrontDistributionId;
    const distributionConfig = new SimCloudFrontDistributionConfigNormalizer(
      config,
    ).normalize();

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    this.authorizer.authorize(distributionId, options?.caller);

    const distribution = this.distributions.get(distributionId);

    if (distribution === undefined) {
      throw new SimCloudFrontNoSuchDistribution(
        `No sim CloudFront Distribution with ID ${distributionId}`,
      );
    }

    // Reject an unusable viewer certificate before the Distribution is
    // touched, as CloudFront rejects the whole request.
    this.viewerCertificateValidator.validate(distributionConfig);

    this.reconfigurer.reconfigure(distribution, distributionConfig);

    // Schedule background task to complete deployment of the sim Distribution.
    this.background.schedule(() => distribution.completeDeployment());

    return {
      Distribution: simCloudFrontDistributionView(distribution),
      $metadata: {},
    };
  }
}
