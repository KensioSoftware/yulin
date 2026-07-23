import {
  assertDefined,
  assertNotNull,
} from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCloudFront } from "../../sim-cloudfront.js";
import type { SimCloudFrontDistribution } from "../../distribution/sim-cloudfront-distribution.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimCfnCfDistroConfigValidator } from "./sim-cfn-cf-distro-config-validator.js";

interface SimCfnCfDistroCreatorProperties {
  readonly cloudFront: SimCloudFront;
}

/**
 * Creates simulated CloudFront Distributions from CloudFormation Resources.
 */
export class SimCfnCfDistroCreator {
  private readonly cloudFront: SimCloudFront;

  constructor(properties: SimCfnCfDistroCreatorProperties) {
    this.cloudFront = properties.cloudFront;
  }

  /**
   * Create a simulated CloudFront Distribution from an
   * AWS::CloudFront::Distribution Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimCloudFrontDistribution> {
    const distributionConfigValue = properties["DistributionConfig"];

    assertDefined(
      distributionConfigValue,
      `AWS::CloudFront::Distribution ${resource.logicalId} DistributionConfig`,
    );
    assertNotNull(
      distributionConfigValue,
      `AWS::CloudFront::Distribution ${resource.logicalId} DistributionConfig`,
    );

    const validator = new SimCfnCfDistroConfigValidator({
      logicalId: resource.logicalId,
      distributionConfig: distributionConfigValue,
    });
    const distributionConfig = validator.validate();

    const output = await this.cloudFront.createDistribution({
      input: {
        DistributionConfig: distributionConfig,
      },
    });

    const distributionId = output.Distribution?.Id;
    assertDefined(
      distributionId,
      `AWS::CloudFront::Distribution ${resource.logicalId} created Distribution Id`,
    );

    const distribution = this.cloudFront.getSimDistributionById(distributionId);

    assertDefined(
      distribution,
      `Expected sim CloudFront Distribution ${distributionId} to exist after CloudFormation creation`,
    );

    return distribution;
  }
}
