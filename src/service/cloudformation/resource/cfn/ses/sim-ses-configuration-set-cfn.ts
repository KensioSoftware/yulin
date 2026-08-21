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
   * directly usable as the `ConfigurationSetName` of a send. That is also what
   * makes the `Id` attribute the same string, as it is for a template.
   */
  refValue(): SimCfnTemplateValue {
    return this.#configurationSet.configurationSetName;
  }

  /**
   * AWS::SES::ConfigurationSet attributes.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    if (attributeName === "Id") {
      return this.#configurationSet.configurationSetName;
    }

    throw new Error(
      `Unsupported AWS::SES::ConfigurationSet attribute ${attributeName}`,
    );
  }
}
