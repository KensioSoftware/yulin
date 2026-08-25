import type { SimAthenaNamedQuery } from "../../../../athena/named-query/sim-athena-named-query.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimAthenaNamedQueryCfnProperties {
  readonly namedQuery: SimAthenaNamedQuery;
}

/**
 * CloudFormation-facing values for a simulated Athena named query.
 */
export class SimAthenaNamedQueryCfn implements SimCfnResourceValueAdapter {
  private readonly namedQuery: SimAthenaNamedQuery;

  constructor(properties: SimAthenaNamedQueryCfnProperties) {
    this.namedQuery = properties.namedQuery;
  }

  /**
   * AWS::Athena::NamedQuery Ref returns the named query id.
   */
  refValue(): SimCfnTemplateValue {
    return this.namedQuery.namedQueryId;
  }

  /**
   * AWS::Athena::NamedQuery attributes.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    if (attributeName === "NamedQueryId") {
      return this.namedQuery.namedQueryId;
    }

    throw new Error(
      `Unsupported AWS::Athena::NamedQuery attribute ${attributeName}`,
    );
  }
}
