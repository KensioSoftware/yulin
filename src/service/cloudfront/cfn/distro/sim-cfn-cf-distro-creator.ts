import {
  assertDefined,
  assertNotNull,
} from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCloudFront } from "../../sim-cloudfront.js";
import type { SimCloudFrontDistribution } from "../../distribution/sim-cloudfront-distribution.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimCfnCfDistroConfigValidator } from "./sim-cfn-cf-distro-config-validator.js";
import { SimCfnCfDistroWebAclSkip } from "./sim-cfn-cf-distro-web-acl-skip.js";

interface SimCfnCfDistroCreatorProperties {
  readonly cloudFront: SimCloudFront;
}

/**
 * Creates simulated CloudFront Distributions from CloudFormation Resources.
 *
 * A Distribution whose `WebACLId` names a web ACL the deployment skipped is
 * skipped as well. CloudFront refuses a `WebACLId` naming no web ACL, and a
 * skipped web ACL answers `Fn::GetAtt` with a stand-in, so the Distribution
 * would otherwise fail the stack over a rule in a template beside it. A
 * Distribution that is visibly missing is the honest report. Creating it
 * without the firewall it was written with would serve every request the rules
 * were there to stop.
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
    resources: ReadonlyMap<string, SimCfnResource>,
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
    const skipError = new SimCfnCfDistroWebAclSkip().findSkipError(
      resource,
      distributionConfig,
      resources,
    );

    if (skipError !== undefined) {
      throw skipError;
    }

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
