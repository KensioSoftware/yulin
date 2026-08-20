import {
  assertDefined,
  assertNotNull,
} from "../../../../util/type-guard/defined.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCloudFront } from "../../sim-cloudfront.js";
import type { SimCloudFrontDistribution } from "../../distribution/sim-cloudfront-distribution.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimCfnCfDistroConfigValidator } from "./sim-cfn-cf-distro-config-validator.js";
import { simCfnCfDistroWithoutAbsentWebAcl } from "./sim-cfn-cf-distro-web-acl.js";

interface SimCfnCfDistroCreatorProperties {
  readonly cloudFront: SimCloudFront;
}

/**
 * Creates simulated CloudFront Distributions from CloudFormation Resources.
 *
 * A `WebACLId` naming a web ACL this simulation does not hold is left out and
 * recorded. CloudFront has no association Resource, so the reference lives on
 * the Distribution itself, and refusing it would take the Distribution down
 * over a web ACL that was never the point of the template. The site a local
 * dev server and a suite of tests make requests to has to survive that.
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
    context: SimCloudFormationResourceCreateContext,
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
    const output = await this.cloudFront.createDistribution({
      input: {
        DistributionConfig: simCfnCfDistroWithoutAbsentWebAcl(
          resource,
          validator.validate(),
          context.simAws,
        ),
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
