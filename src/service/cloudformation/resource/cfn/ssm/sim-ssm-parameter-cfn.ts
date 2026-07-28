import type { SimSsmParameter } from "../../../../ssm/parameter/sim-ssm-parameter.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimSsmParameterCfnProperties {
  readonly parameter: SimSsmParameter;
}

/**
 * CloudFormation-facing values for a simulated SSM parameter.
 */
export class SimSsmParameterCfn implements SimCfnResourceValueAdapter {
  private readonly parameter: SimSsmParameter;

  constructor(properties: SimSsmParameterCfnProperties) {
    this.parameter = properties.parameter;
  }

  /**
   * AWS::SSM::Parameter Ref returns the parameter name rather than its ARN,
   * which is what makes a Ref usable as a GetParameter Name.
   */
  refValue(): SimCfnTemplateValue {
    return this.parameter.name.value;
  }

  /**
   * AWS::SSM::Parameter attributes.
   *
   * `Value` reads the current version, so a Resource depending on it sees
   * what the parameter holds after the stack deployed it.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    switch (attributeName) {
      case "Type": {
        return this.parameter.type.value;
      }
      case "Value": {
        return this.parameter.currentVersion.value.value;
      }
      default: {
        throw new Error(
          `Unsupported AWS::SSM::Parameter attribute ${attributeName}`,
        );
      }
    }
  }
}
