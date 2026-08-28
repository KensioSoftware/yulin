import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCloudFront } from "../../sim-cloudfront.js";
import type { SimCloudFrontDistribution } from "../../distribution/sim-cloudfront-distribution.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

interface SimCfnCfDistroDeleterProperties {
  readonly cloudFront: SimCloudFront;
}

/**
 * Deletes simulated Distributions created from AWS::CloudFront::Distribution
 * Resources.
 *
 * CloudFront refuses to delete a Distribution that is still serving, so this
 * disables it first, which is what makes deleting one a two-command sequence
 * everywhere: UpdateDistribution with `Enabled: false`, then
 * DeleteDistribution. CloudFormation does the disable itself rather than asking
 * the template to declare a disabled Distribution before it can be removed.
 *
 * The Distribution is updated with the configuration it already has, so nothing
 * but `Enabled` changes on the way out.
 */
export class SimCfnCfDistroDeleter {
  private readonly cloudFront: SimCloudFront;

  constructor(properties: SimCfnCfDistroDeleterProperties) {
    this.cloudFront = properties.cloudFront;
  }

  /**
   * Disable and then delete the Distribution a Resource created.
   */
  async delete(
    resource: SimCfnResource,
    options?: SimCfnResourceCallerOptions,
  ): Promise<void> {
    const distribution = resource.simResource as
      | SimCloudFrontDistribution
      | undefined;
    assertDefined(
      distribution,
      `sim CloudFront Distribution for CloudFormation Resource ${resource.logicalId}`,
    );

    await this.disable(distribution, options);

    await this.cloudFront.deleteDistribution(
      { input: { Id: distribution.distributionId } },
      options,
    );
  }

  private async disable(
    distribution: SimCloudFrontDistribution,
    options: SimCfnResourceCallerOptions,
  ): Promise<void> {
    const { distributionConfig } = distribution;
    assertDefined(
      distributionConfig,
      `sim CloudFront Distribution ${distribution.distributionId} configuration to disable`,
    );

    await this.cloudFront.updateDistribution(
      {
        input: {
          Id: distribution.distributionId,
          DistributionConfig: { ...distributionConfig, Enabled: false },
        },
      },
      options,
    );
  }
}
