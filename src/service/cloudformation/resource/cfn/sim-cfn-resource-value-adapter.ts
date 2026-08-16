import type { SimCfnTemplateValue } from "../../template/value/sim-cfn-template-value.js";
import { SimCfnDefaultResourceValueAdapter } from "./sim-cfn-default-resource-value-adapter.js";
import { simCfnServiceValueAdapters } from "./sim-cfn-service-value-adapters.js";

export interface SimCfnResourceValueAdapter {
  refValue(): SimCfnTemplateValue;

  attributeValue(attributeName: string): SimCfnTemplateValue;
}

export interface SimCfnResourceValueAdapterProperties {
  readonly logicalId: string;
  readonly type: string | undefined;
  readonly simResource: object | undefined;
}

/**
 * The adapter for a Resource type one service owns, or nothing when the
 * Resource belongs to another service.
 */
export type SimCfnServiceValueAdapter = SimCfnResourceValueAdapter | undefined;

/**
 * Build the CloudFormation-facing value adapter for a created simulated
 * Resource.
 *
 * The underlying simulated AWS service object stays service-focused; this
 * adapter owns CloudFormation-specific Ref and Fn::GetAtt behavior.
 *
 * Each service matches its own Resource types, beside that service's adapters,
 * so this registry stays a list of services. A Resource no service claims
 * falls through to the default adapter, which answers a Ref with the logical
 * ID.
 */
export function simCfnResourceValueAdapter(
  properties: SimCfnResourceValueAdapterProperties,
): SimCfnResourceValueAdapter {
  for (const serviceAdapter of simCfnServiceValueAdapters) {
    const adapter = serviceAdapter(properties);

    if (adapter !== undefined) {
      return adapter;
    }
  }

  return new SimCfnDefaultResourceValueAdapter({
    logicalId: properties.logicalId,
  });
}
