import type { SimSesTemplate } from "../../../../ses/template/sim-ses-template.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimSesTemplateCfnProperties {
  readonly template: SimSesTemplate;
}

/**
 * CloudFormation-facing values for a simulated SES email template.
 */
export class SimSesTemplateCfn implements SimCfnResourceValueAdapter {
  readonly #template: SimSesTemplate;

  constructor(properties: SimSesTemplateCfnProperties) {
    this.#template = properties.template;
  }

  /**
   * AWS::SES::Template Ref returns the template name.
   *
   * A template has no identifier apart from its name, so a Ref is directly
   * usable as the `TemplateName` of a send. That is also what makes the `Id`
   * attribute the same string.
   */
  refValue(): SimCfnTemplateValue {
    return this.#template.templateName;
  }

  /**
   * AWS::SES::Template attributes.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    if (attributeName === "Id") {
      return this.#template.templateName;
    }

    throw new Error(
      `Unsupported AWS::SES::Template attribute ${attributeName}`,
    );
  }
}
