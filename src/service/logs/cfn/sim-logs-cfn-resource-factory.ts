import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
  SimCloudFormationResourceDeleteContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import { simCfnResourceCallerOptions } from "../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimLogsAuthorizer } from "../command/authorize/sim-logs-authorizer.js";
import type { SimLogs } from "../sim-logs.js";
import { SimCfnDeliveryAuthorization } from "./delivery/sim-cfn-delivery-authorization.js";
import { SimCfnDeliveryCreator } from "./delivery/sim-cfn-delivery-creator.js";
import { SimCfnDeliveryDestinationCreator } from "./delivery/sim-cfn-delivery-destination-creator.js";
import { SimCfnDeliverySourceCreator } from "./delivery/sim-cfn-delivery-source-creator.js";
import { SimCfnLogGroupCreator } from "./group/sim-cfn-log-group-creator.js";
import { SimCfnMetricFilterCreator } from "./metric/sim-cfn-metric-filter-creator.js";
import { SimLogsCfnResourceDeleter } from "./sim-logs-cfn-resource-deleter.js";
import { unsupportedSimLogsResourceType } from "./sim-logs-cfn-unsupported-resource.js";

interface SimLogsCfnResourceFactoryProperties {
  readonly logs: SimLogs;
  readonly authorizer: SimLogsAuthorizer;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * CloudFormation Resource factory for simulated CloudWatch Logs resources.
 *
 * Log groups and the three delivery Resource types. Delivery is the whole of
 * CloudFront standard logging v2 in a template. A distribution carries no
 * logging property of its own, and a stack that turns logging on is made of
 * those three Resources and nothing else.
 *
 * Metric filters are created here too, and publish into the simulated
 * CloudWatch of the log group's own Account and Region.
 *
 * Subscription filters are not. `PutSubscriptionFilter` holds one, and a stack
 * declaring `AWS::Logs::SubscriptionFilter` records it as a skip.
 */
export class SimLogsCfnResourceFactory implements SimCfnServiceResourceFactory {
  readonly #logGroups: SimCfnLogGroupCreator;
  readonly #metricFilters: SimCfnMetricFilterCreator;
  readonly #deliverySources: SimCfnDeliverySourceCreator;
  readonly #deliveryDestinations: SimCfnDeliveryDestinationCreator;
  readonly #deliveries: SimCfnDeliveryCreator;
  readonly #deleter: SimLogsCfnResourceDeleter;

  constructor(properties: SimLogsCfnResourceFactoryProperties) {
    const delivery = {
      logs: properties.logs,
      authorization: new SimCfnDeliveryAuthorization(properties),
    };

    this.#logGroups = new SimCfnLogGroupCreator(properties);
    this.#metricFilters = new SimCfnMetricFilterCreator(properties);
    this.#deliverySources = new SimCfnDeliverySourceCreator(delivery);
    this.#deliveryDestinations = new SimCfnDeliveryDestinationCreator(delivery);
    this.#deliveries = new SimCfnDeliveryCreator(delivery);
    this.#deleter = new SimLogsCfnResourceDeleter({
      logGroups: this.#logGroups,
      metricFilters: this.#metricFilters,
      deliverySources: this.#deliverySources,
      deliveryDestinations: this.#deliveryDestinations,
      deliveries: this.#deliveries,
    });
  }

  /**
   * Create a simulated CloudWatch Logs resource from a CloudFormation
   * Resource.
   */
  async create(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<object | undefined> {
    const values = context.resolvedProperties ?? resource.properties;
    const options = simCfnResourceCallerOptions(context.caller);

    switch (resourceTypeName) {
      case "LogGroup": {
        return await this.#logGroups.create(resource, values, options);
      }
      case "MetricFilter": {
        return await this.#metricFilters.create(resource, values, options);
      }
      case "DeliverySource": {
        return await this.#deliverySources.create(resource, values, options);
      }
      case "DeliveryDestination": {
        return await this.#deliveryDestinations.create(
          resource,
          values,
          options,
        );
      }
      case "Delivery": {
        return await this.#deliveries.create(resource, values, options);
      }
      default: {
        throw unsupportedSimLogsResourceType(resourceTypeName, "");
      }
    }
  }

  /**
   * Delete a simulated CloudWatch Logs resource created from a CloudFormation
   * Resource.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceDeleteContext,
  ): Promise<void> {
    await this.#deleter.delete(
      resourceTypeName,
      resource,
      simCfnResourceCallerOptions(context.caller),
    );
  }
}
