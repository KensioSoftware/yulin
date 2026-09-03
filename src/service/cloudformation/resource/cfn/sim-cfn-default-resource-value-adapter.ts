import type { SimCfnTemplateValue } from "../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "./sim-cfn-resource-value-adapter.js";
import { simCfnUnansweredAttribute } from "./sim-cfn-unanswered-attribute.js";

interface SimCfnDefaultResourceValueAdapterProperties {
  readonly logicalId: string;
  readonly uncreatedPhysicalName?: string | undefined;
}

/**
 * Fallback CloudFormation-facing values for Resource types without specific
 * simulator support.
 */
export class SimCfnDefaultResourceValueAdapter implements SimCfnResourceValueAdapter {
  private readonly logicalId: string;
  private readonly uncreatedPhysicalName: string | undefined;

  constructor(properties: SimCfnDefaultResourceValueAdapterProperties) {
    this.logicalId = properties.logicalId;
    this.uncreatedPhysicalName = properties.uncreatedPhysicalName;
  }

  /**
   * The physical ID this Resource would have had, or the logical-ID stand-in.
   *
   * A service that worked out the Resource's name before refusing to create it
   * leaves the simulation holding the name real CloudFormation would have
   * produced. That is what Ref answers with. The logical ID is left for a
   * Resource nothing ever named.
   */
  refValue(): SimCfnTemplateValue {
    return this.uncreatedPhysicalName ?? this.logicalId;
  }

  /**
   * Default attribute stand-in.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    return simCfnUnansweredAttribute(this.logicalId, attributeName);
  }
}
