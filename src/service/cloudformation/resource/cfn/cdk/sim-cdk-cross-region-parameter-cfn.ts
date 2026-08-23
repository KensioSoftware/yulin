import type { SimCdkCrossRegionParameterReading } from "../../../cdk/ssm/cross-region-parameter/sim-cdk-cross-region-parameter-reading.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";
import { simCfnUnansweredAttribute } from "../sim-cfn-unanswered-attribute.js";

interface SimCdkCrossRegionParameterCfnProperties {
  readonly logicalId: string;
  readonly reading: SimCdkCrossRegionParameterReading;
}

/**
 * CloudFormation-facing values for a CDK cross-Region parameter reading.
 */
export class SimCdkCrossRegionParameterCfn implements SimCfnResourceValueAdapter {
  private readonly logicalId: string;
  private readonly reading: SimCdkCrossRegionParameterReading;

  constructor(properties: SimCdkCrossRegionParameterCfnProperties) {
    this.logicalId = properties.logicalId;
    this.reading = properties.reading;
  }

  /**
   * A custom Resource Ref answers with the physical ID its provider returned,
   * and CDK's reader returns none, so the logical ID stands in for it as it
   * does for any other Resource without one.
   */
  refValue(): SimCfnTemplateValue {
    return this.logicalId;
  }

  /**
   * `FunctionArn` is the one attribute CDK's provider function answers with,
   * whatever the parameter holds, so it is the one this reading answers.
   *
   * A reading whose parameter was never written answers with the stand-in an
   * unanswerable attribute resolves to everywhere else. The Resource read
   * nothing, and a service meeting the value can tell that is what happened.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    if (attributeName !== "FunctionArn") {
      throw new Error(
        `Unsupported Custom::CrossRegionStringParameterReader attribute ${
          attributeName
        }`,
      );
    }

    return (
      this.reading.value ??
      simCfnUnansweredAttribute(this.logicalId, attributeName)
    );
  }
}
