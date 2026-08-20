import type { CommandHandler } from "../../../../command/command-handler.js";
import type {
  SimCreateDistributionCommand,
  SimCreateDistributionCommandOutput,
} from "./create-distribution.command.js";
import type { SimCloudFrontRegistry } from "../../registry/sim-cloud-front-registry.js";
import {
  SimCloudFrontDistribution,
  type SimCloudFrontDistributionId,
} from "../../distribution/sim-cloudfront-distribution.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCloudFrontS3OriginResolver } from "../../origin/s3/sim-cloudfront-s3-origin.js";
import type { SimCfCustomOriginDispatcher } from "../../origin/custom/sim-cf-custom-origin-dispatcher.js";
import type { SimCloudFrontOriginAccessControlRegistry } from "../../origin-access-control/sim-cf-origin-access-control-registry.js";
import type { SimCloudFrontResponseHeadersPolicyRegistry } from "../../response-headers-policy/sim-cf-response-headers-policy-registry.js";
import type { SimCfWebAclResolver } from "../../web-acl/sim-cf-web-acl.js";
import type { BackgroundScheduler } from "../../../../util/background/background.js";
import { makeSimCloudFrontDistributionConfigurator } from "../../distribution/configurator/sim-cf-distribution-configurator.factory.js";
import type { SimCloudFrontDistributionConfigurator } from "../../distribution/configurator/sim-cloud-front-distribution-configurator.js";
import { SimCloudFrontDistributionConfigNormalizer } from "./sim-cf-distro-config-normalizer.js";
import { simCloudFrontDistributionView } from "../../distribution/sim-cf-distribution-view.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { CreateDistributionAuthorizer } from "./create-distribution-authorizer.js";
import type { SimAcmRegistry } from "../../../acm/registry/sim-acm-registry.js";
import { SimCloudFrontViewerCertificateValidator } from "../../distribution/viewer-certificate/sim-cf-viewer-certificate-validator.js";

interface CreateDistributionCommandHandlerProperties {
  readonly accountId: SimAwsAccountId;
  readonly distributions: Map<
    SimCloudFrontDistributionId,
    SimCloudFrontDistribution
  >;
  readonly cloudFrontRegistry: SimCloudFrontRegistry;
  readonly s3OriginResolver: SimCloudFrontS3OriginResolver;
  readonly customOriginDispatcher?: SimCfCustomOriginDispatcher | undefined;
  readonly originAccessControls: SimCloudFrontOriginAccessControlRegistry;
  readonly responseHeadersPolicies: SimCloudFrontResponseHeadersPolicyRegistry;
  readonly webAclResolver?: SimCfWebAclResolver | undefined;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly acmRegistry?: SimAcmRegistry | undefined;
  readonly background: BackgroundScheduler;
}

interface CreateDistributionCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
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
  private readonly authorizer: CreateDistributionAuthorizer;
  private readonly viewerCertificateValidator: SimCloudFrontViewerCertificateValidator;
  private readonly background: BackgroundScheduler;

  constructor(properties: CreateDistributionCommandHandlerProperties) {
    this.accountId = properties.accountId;
    this.distributions = properties.distributions;
    this.cloudFrontRegistry = properties.cloudFrontRegistry;
    this.distributionConfigurator =
      makeSimCloudFrontDistributionConfigurator(properties);
    this.authorizer = new CreateDistributionAuthorizer({
      iam: properties.iam ?? new SimIamAllowAllAuth(),
    });
    this.viewerCertificateValidator =
      new SimCloudFrontViewerCertificateValidator({
        acmRegistry: properties.acmRegistry,
      });
    this.background = properties.background;
  }

  /**
   * Handle creation of a new CloudFront Distribution.
   */
  async handle(
    command: SimCreateDistributionCommand,
    options?: CreateDistributionCommandHandlerOptions,
  ): Promise<SimCreateDistributionCommandOutput> {
    const distributionConfigInput = command.input.DistributionConfig;
    assertDefined(
      distributionConfigInput,
      "CreateDistributionCommand.DistributionConfig",
    );

    const normalizer = new SimCloudFrontDistributionConfigNormalizer(
      distributionConfigInput,
    );
    const distributionConfig = normalizer.normalize();

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    this.authorizer.authorize(options?.caller);

    // Reject an unusable viewer certificate before any Distribution state is
    // allocated, as CloudFront rejects the whole request.
    this.viewerCertificateValidator.validate(distributionConfig);

    const distributionId = this.cloudFrontRegistry.allocateDistributionId();
    const distribution = new SimCloudFrontDistribution({
      distributionId,
      distributionConfig,
      status: "Deploying",
      accountId: this.accountId,
      clock: this.background,
    });

    this.distributionConfigurator.configure(distribution, distributionConfig);

    this.distributions.set(distribution.distributionId, distribution);
    this.cloudFrontRegistry.registerDistribution(
      distribution.distributionId,
      this.accountId,
    );

    for (const alternateDomainName of distribution.getAlternateDomainNames()) {
      this.cloudFrontRegistry.registerAlternateDomainName(
        alternateDomainName,
        distribution.distributionId,
      );
    }

    // Schedule background task to complete deployment of the sim Distribution.
    this.background.schedule(() => distribution.completeDeployment());

    return {
      Distribution: simCloudFrontDistributionView(distribution),
      Location: `https://cloudfront.amazonaws.com/2020-05-31/distribution/${distribution.distributionId}`,
      $metadata: {},
    };
  }
}
