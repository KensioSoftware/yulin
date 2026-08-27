import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
  SimCloudFormationResourceDeleteContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import { simCfnResourceCallerOptions } from "../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";
import type { SimLogs } from "../sim-logs.js";
import { SimCfnDeliveryCreator } from "./delivery/sim-cfn-delivery-creator.js";
import { SimCfnDeliveryDestinationCreator } from "./delivery/sim-cfn-delivery-destination-creator.js";
import { SimCfnDeliverySourceCreator } from "./delivery/sim-cfn-delivery-source-creator.js";
import { SimCfnLogGroupCreator } from "./group/sim-cfn-log-group-creator.js";
import { SimLogsCfnResourceDeleter } from "./sim-logs-cfn-resource-deleter.js";
import { unsupportedSimLogsResourceType } from "./sim-logs-cfn-unsupported-resource.js";

interface SimLogsCfnResourceFactoryProperties {
  readonly logs: SimLogs;
}

/**
 * CloudFormation Resource factory for simulated CloudWatch Logs resources.
 *
 * Log groups and the three delivery Resource types. Delivery is the whole of
 * CloudFront standard logging v2 in a template. A distribution carries no
 * logging property of its own, and a stack that turns logging on is made of
 * those three Resources and nothing else.
 *
 * Subscription filters and metric filters are not created here. Both need
 * machinery this simulation does not have yet, and a stack declaring one
 * records it as a skip.
 */
export class SimLogsCfnResourceFactory implements SimCfnServiceResourceFactory {
  readonly #logGroups: SimCfnLogGroupCreator;
  readonly #deliverySources: SimCfnDeliverySourceCreator;
  readonly #deliveryDestinations: SimCfnDeliveryDestinationCreator;
  readonly #deliveries: SimCfnDeliveryCreator;
  readonly #deleter: SimLogsCfnResourceDeleter;

  constructor(properties: SimLogsCfnResourceFactoryProperties) {
    this.#logGroups = new SimCfnLogGroupCreator(properties);
    this.#deliverySources = new SimCfnDeliverySourceCreator(properties);
    this.#deliveryDestinations = new SimCfnDeliveryDestinationCreator(
      properties,
    );
    this.#deliveries = new SimCfnDeliveryCreator(properties);
    this.#deleter = new SimLogsCfnResourceDeleter({
      logGroups: this.#logGroups,
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
        return this.#logGroups.create(resource, values);
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
