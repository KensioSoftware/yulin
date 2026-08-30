import type { SimCfnPropertyIgnorer } from "../../../cloudformation/resource/ignore/sim-cfn-ignored-property.type.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { unsimulatedPropertyReasons } from "./sim-cfn-metric-filter-unsimulated-properties.js";

/** The properties a metric filter Resource is actually created from. */
const actedOnProperties = new Set([
  "LogGroupName",
  "FilterName",
  "FilterPattern",
  "MetricTransformations",
]);

interface SimCfnMetricFilterPropertyRulesProperties {
  readonly properties: SimCfnTemplateValueRecord;
  readonly ignorer: SimCfnPropertyIgnorer;
}

/**
 * What a metric filter Resource is created without acting on.
 */
export class SimCfnMetricFilterPropertyRules {
  readonly #properties: SimCfnTemplateValueRecord;
  readonly #ignorer: SimCfnPropertyIgnorer;

  constructor(properties: SimCfnMetricFilterPropertyRulesProperties) {
    this.#properties = properties.properties;
    this.#ignorer = properties.ignorer;
  }

  /**
   * Record every property the metric filter is created without.
   */
  apply(): void {
    for (const name of Object.keys(this.#properties)) {
      this.applyToProperty(name);
    }
  }

  private applyToProperty(name: string): void {
    if (actedOnProperties.has(name)) {
      return;
    }

    const unsimulatedReason = unsimulatedPropertyReasons.get(name);

    if (unsimulatedReason === undefined) {
      this.#ignorer.ignoreProperty(
        name,
        `${name} is not a property simulated CloudWatch Logs knows about, so ` +
          `the metric filter is created without it`,
      );

      return;
    }

    this.#ignorer.ignoreProperty(
      name,
      `${name} is a real AWS::Logs::MetricFilter property simulated ` +
        `CloudWatch Logs does not act on: ${unsimulatedReason}`,
    );
  }
}
