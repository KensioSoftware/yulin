import type { AwsRegionName } from "../../../../aws/sim-aws-region.js";

interface SimCdkCrossRegionParameterReadingProperties {
  readonly parameterName: string;
  readonly regionName: AwsRegionName;
  readonly value?: string | undefined;
}

/**
 * What one Custom::CrossRegionStringParameterReader read.
 *
 * This is the simulated object the Resource is created as, and what
 * `Fn::GetAtt` on it is answered from. CDK's provider function answers with
 * `Data: { FunctionArn: <value> }` whatever the parameter holds, because the
 * only construct that builds this Resource is `EdgeFunction`.
 *
 * A reading with no value is one whose parameter was not there. That happens
 * where the Stack holding the parameter was never deployed, which is what
 * deploying one template of a cloud assembly rather than the assembly comes
 * to.
 */
export class SimCdkCrossRegionParameterReading {
  public readonly parameterName: string;
  public readonly regionName: AwsRegionName;
  public readonly value: string | undefined;

  constructor(properties: SimCdkCrossRegionParameterReadingProperties) {
    this.parameterName = properties.parameterName;
    this.regionName = properties.regionName;
    this.value = properties.value;
  }
}
