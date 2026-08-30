import { SimCfnGeneratedResourceName } from "../../../cloudformation/resource/name/sim-cfn-generated-resource-name.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimLogsMetricTransformationInput } from "../../command/metric/metric-filter.command.js";
import { SimCfnMetricFilterPropertyRules } from "./sim-cfn-metric-filter-property-rules.js";
import { metricFilterRequiredString } from "./sim-cfn-metric-filter-value.js";
import { simCfnMetricTransformations } from "./sim-cfn-metric-transformation-values.js";

const maximumNameLength = 512;

interface SimCfnMetricFilterPropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads AWS::Logs::MetricFilter CloudFormation properties.
 */
export class SimCfnMetricFilterProperties {
  readonly #resource: SimCfnResource;
  readonly #properties: SimCfnTemplateValueRecord;
  readonly #rules: SimCfnMetricFilterPropertyRules;

  constructor(properties: SimCfnMetricFilterPropertiesProperties) {
    this.#resource = properties.resource;
    this.#properties = properties.properties;
    this.#rules = new SimCfnMetricFilterPropertyRules({
      properties: properties.properties,
      ignorer: properties.resource,
    });
  }

  /**
   * The log group the filter watches.
   */
  logGroupName(): string {
    return this.required(this.#properties["LogGroupName"], "LogGroupName");
  }

  /**
   * The filter's name.
   *
   * An unnamed filter is named after the stack and the logical ID, as real
   * CloudFormation names one. CDK's `MetricFilter` construct leaves the
   * property off unless a name is given.
   */
  filterName(): string {
    const name = this.#properties["FilterName"];

    if (name === undefined) {
      return new SimCfnGeneratedResourceName({
        stackName: this.#resource.stackName,
        logicalId: this.#resource.logicalId,
        maximumLength: maximumNameLength,
      }).value;
    }

    return this.required(name, "FilterName");
  }

  /**
   * The pattern deciding which events the filter counts.
   */
  filterPattern(): string {
    return this.required(this.#properties["FilterPattern"], "FilterPattern");
  }

  /**
   * The transformations the filter publishes through.
   */
  metricTransformations(): readonly SimLogsMetricTransformationInput[] {
    return simCfnMetricTransformations(
      this.#resource.logicalId,
      this.#properties["MetricTransformations"],
    );
  }

  /**
   * Record the properties the metric filter is created without acting on.
   */
  recordIgnoredProperties(): void {
    this.#rules.apply();
  }

  private required(value: unknown, name: string): string {
    return metricFilterRequiredString(
      this.#resource.logicalId,
      value as never,
      name,
    );
  }
}
