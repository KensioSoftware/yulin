import type { SimCloudFrontDistributionConfig } from "../../command/create-distribution/create-distribution.cmd.js";
import { isRecord } from "../../../../util/type-guard/record.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../cloudformation/template/value/sim-cfn-template-value.js";

type DistributionConfigInput =
  | string
  | number
  | boolean
  | SimCfnTemplateValueRecord
  | SimCfnTemplateValue[];

interface SimCfnCloudFrontDistributionConfigValidatorProps {
  readonly logicalId: string;
  readonly distributionConfig: DistributionConfigInput;
}

/**
 * Narrows a CloudFormation DistributionConfig template value to the structural
 * type accepted by the sim CloudFront CreateDistribution command.
 *
 * This is not an AWS schema validator. Command handling and Distribution
 * configurators own any simulator-specific runtime validation.
 */
export class SimCfnCfDistroConfigValidator {
  private readonly logicalId: string;
  private readonly distributionConfig: DistributionConfigInput;

  constructor(props: SimCfnCloudFrontDistributionConfigValidatorProps) {
    this.logicalId = props.logicalId;
    this.distributionConfig = props.distributionConfig;
  }

  /**
   * Validate and return the DistributionConfig as the sim CloudFront config type.
   */
  validate(): SimCloudFrontDistributionConfig {
    if (!isRecord(this.distributionConfig)) {
      throw new Error(
        `Invalid AWS::CloudFront::Distribution ${this.logicalId}: DistributionConfig must be an object`,
      );
    }

    return this.distributionConfig;
  }
}
