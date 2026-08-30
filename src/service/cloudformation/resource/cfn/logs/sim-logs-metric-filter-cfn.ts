import type { SimLogsMetricFilter } from "../../../../logs/metric/sim-logs-metric-filter.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimLogsMetricFilterCfnProperties {
  readonly filter: SimLogsMetricFilter;
}

/**
 * CloudFormation-facing values for a simulated CloudWatch Logs metric filter.
 */
export class SimLogsMetricFilterCfn implements SimCfnResourceValueAdapter {
  readonly #filter: SimLogsMetricFilter;

  constructor(properties: SimLogsMetricFilterCfnProperties) {
    this.#filter = properties.filter;
  }

  /**
   * AWS::Logs::MetricFilter Ref returns the filter name.
   */
  refValue(): SimCfnTemplateValue {
    return this.#filter.filterName;
  }

  /**
   * AWS::Logs::MetricFilter attributes, of which real CloudFormation returns
   * none.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    throw new Error(
      `Unsupported AWS::Logs::MetricFilter attribute ${attributeName}`,
    );
  }
}
