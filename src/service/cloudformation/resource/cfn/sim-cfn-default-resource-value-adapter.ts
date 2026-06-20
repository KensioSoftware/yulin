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
  constructor(private readonly props: SimCfnDefaultResourceValueAdapterProps) {}

  /**
   * Default physical-ID stand-in.
   */
  refValue(): SimCfnTemplateValue {
    return this.props.logicalId;
  }

  /**
   * Default attribute stand-in.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    return `${this.props.logicalId}.${attributeName}`;
  }
}
