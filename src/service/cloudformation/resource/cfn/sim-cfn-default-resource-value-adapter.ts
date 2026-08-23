import type { SimCfnTemplateValue } from "../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "./sim-cfn-resource-value-adapter.js";
import { simCfnUnansweredAttribute } from "./sim-cfn-unanswered-attribute.js";

interface SimCfnDefaultResourceValueAdapterProperties {
  readonly logicalId: string;
}

/**
 * Fallback CloudFormation-facing values for Resource types without specific
 * simulator support.
 */
export class SimCfnDefaultResourceValueAdapter implements SimCfnResourceValueAdapter {
  private readonly logicalId: string;

  constructor(properties: SimCfnDefaultResourceValueAdapterProperties) {
    this.logicalId = properties.logicalId;
  }

  /**
   * Default physical-ID stand-in.
   */
  refValue(): SimCfnTemplateValue {
    return this.logicalId;
  }

  /**
   * Default attribute stand-in.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    return simCfnUnansweredAttribute(this.logicalId, attributeName);
  }
}
