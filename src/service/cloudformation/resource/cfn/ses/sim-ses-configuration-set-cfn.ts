import type { SimSesConfigurationSet } from "../../../../ses/configuration-set/sim-ses-configuration-set.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimSesConfigurationSetCfnProperties {
  readonly configurationSet: SimSesConfigurationSet;
}

/**
 * CloudFormation-facing values for a simulated SES configuration set.
 */
export class SimSesConfigurationSetCfn implements SimCfnResourceValueAdapter {
  readonly #configurationSet: SimSesConfigurationSet;

  constructor(properties: SimSesConfigurationSetCfnProperties) {
    this.#configurationSet = properties.configurationSet;
  }

  /**
   * AWS::SES::ConfigurationSet Ref returns the set's name.
   *
   * A configuration set has no identifier apart from its name, so a Ref is
   * directly usable as the `ConfigurationSetName` of a send.
   */
  refValue(): SimCfnTemplateValue {
    return this.#configurationSet.configurationSetName;
  }

  /**
   * AWS::SES::ConfigurationSet has no attributes at all.
   *
   * Unlike `AWS::SES::Template`, which answers an `Id`, this Resource type
   * publishes nothing for `Fn::GetAtt` to read. Answering one anyway would let
   * a template deploy here and fail on AWS.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    throw new Error(
      `Unsupported AWS::SES::ConfigurationSet attribute ${attributeName}`,
    );
  }
}
