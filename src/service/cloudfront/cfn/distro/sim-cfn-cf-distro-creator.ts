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
import type { SimCloudFrontDistributionConfig } from "../../command/create-distribution/create-distribution.command.js";
import { SimCfnCfDistroConfigValidator } from "./sim-cfn-cf-distro-config-validator.js";
import { simCfnCfDistroWithRunnableEdgeAssociations } from "./sim-cfn-cf-distro-edge-associations.js";
import { simCfnCfDistroWithHeldResponseHeadersPolicies } from "./sim-cfn-cf-distro-response-headers-policy.js";
import { simCfnCfDistroWithoutAbsentWebAcl } from "./sim-cfn-cf-distro-web-acl.js";
import type { SimAws } from "../../../aws/sim-aws.js";

interface SimCfnCfDistroCreatorProperties {
  readonly cloudFront: SimCloudFront;
}

/**
 * Creates simulated CloudFront Distributions from CloudFormation Resources.
 *
 * A `WebACLId` naming a web ACL this simulation does not hold is left out and
 * recorded, and so are a Lambda@Edge association it cannot run and a
 * `ResponseHeadersPolicyId` naming a policy it does not hold. CloudFront has no
 * Resource of its own for any of the three, so all of them live on the
 * Distribution itself, and refusing one would take the Distribution down over
 * something that was never the point of the template. The site a local dev
 * server and a suite of tests make requests to has to survive that.
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
        DistributionConfig: deployableConfig(
          resource,
          validator.validate(),
          context.simAws,
          this.cloudFront,
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

/**
 * The DistributionConfig to deploy, without the parts this simulation cannot
 * act on, each recorded on the Resource.
 */
function deployableConfig(
  resource: SimCfnResource,
  distributionConfig: SimCloudFrontDistributionConfig,
  simAws: SimAws,
  cloudFront: SimCloudFront,
): SimCloudFrontDistributionConfig {
  return simCfnCfDistroWithoutAbsentWebAcl(
    resource,
    simCfnCfDistroWithHeldResponseHeadersPolicies(
      resource,
      simCfnCfDistroWithRunnableEdgeAssociations(
        resource,
        distributionConfig,
        simAws,
      ),
      cloudFront,
    ),
    simAws,
  );
}
