import type { SimCfnTemplateValue } from "../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "./sim-cfn-resource-value-adapter.js";

interface SimCfnDefaultResourceValueAdapterProps {
  readonly logicalId: string;
}

/**
 * Fallback CloudFormation-facing values for Resource types without specific
 * simulator support.
 */
export class SimCfnDefaultResourceValueAdapter implements SimCfnResourceValueAdapter {
  private readonly logicalId: string;

  constructor(props: SimCfnDefaultResourceValueAdapterProps) {
    this.logicalId = props.logicalId;
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
    return `${this.logicalId}.${attributeName}`;
  }
}
