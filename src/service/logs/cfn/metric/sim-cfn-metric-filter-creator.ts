import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimLogsMetricFilter } from "../../metric/sim-logs-metric-filter.js";
import type { SimLogs } from "../../sim-logs.js";
import { SimCfnMetricFilterProperties } from "./sim-cfn-metric-filter-properties.js";

interface SimCfnMetricFilterCreatorProperties {
  readonly logs: SimLogs;
}

/**
 * Creates simulated metric filters from AWS::Logs::MetricFilter Resources.
 *
 * The command is the one an SDK caller would have used, so a deployment
 * without `logs:PutMetricFilter` fails here the way it fails on a real deploy.
 * The log group has to be there already, which real CloudFormation also
 * requires: a template declaring a filter over a group it does not also
 * declare depends on something the stack never made.
 */
export class SimCfnMetricFilterCreator {
  readonly #logs: SimLogs;

  constructor(properties: SimCfnMetricFilterCreatorProperties) {
    this.#logs = properties.logs;
  }

  /**
   * Create a metric filter from an AWS::Logs::MetricFilter Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    options?: SimCfnResourceCallerOptions,
  ): Promise<SimLogsMetricFilter> {
    const filterProperties = new SimCfnMetricFilterProperties({
      resource,
      properties,
    });
    const logGroupName = filterProperties.logGroupName();
    const filterName = filterProperties.filterName();

    filterProperties.recordIgnoredProperties();

    await this.#logs.putMetricFilter(
      {
        input: {
          logGroupName,
          filterName,
          filterPattern: filterProperties.filterPattern(),
          metricTransformations: filterProperties.metricTransformations(),
        },
      },
      options,
    );

    const group = this.#logs.findLogGroup(logGroupName);
    const filter = group?.metricFilters.find(filterName);

    assertDefined(
      filter,
      `sim metric filter ${filterName} after CloudFormation creation`,
    );

    return filter;
  }

  /**
   * Delete a metric filter created from an AWS::Logs::MetricFilter Resource.
   */
  async delete(
    filter: SimLogsMetricFilter,
    options?: SimCfnResourceCallerOptions,
  ): Promise<void> {
    await this.#logs.deleteMetricFilter(
      {
        input: {
          logGroupName: filter.logGroupName,
          filterName: filter.filterName,
        },
      },
      options,
    );
  }
}
