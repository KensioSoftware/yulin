import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimLogsDeliveryDestination } from "../delivery/sim-logs-delivery-destination.js";
import type { SimLogsDeliverySource } from "../delivery/sim-logs-delivery-source.js";
import type { SimLogsDelivery } from "../delivery/sim-logs-delivery.js";
import type { SimLogsLogGroup } from "../group/sim-logs-log-group.js";
import type { SimCfnDeliveryCreator } from "./delivery/sim-cfn-delivery-creator.js";
import type { SimCfnDeliveryDestinationCreator } from "./delivery/sim-cfn-delivery-destination-creator.js";
import type { SimCfnDeliverySourceCreator } from "./delivery/sim-cfn-delivery-source-creator.js";
import type { SimCfnLogGroupCreator } from "./group/sim-cfn-log-group-creator.js";
import { unsupportedSimLogsResourceType } from "./sim-logs-cfn-unsupported-resource.js";
import type { SimCfnResourceCallerOptions } from "../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

interface SimLogsCfnResourceDeleterProperties {
  readonly logGroups: SimCfnLogGroupCreator;
  readonly deliverySources: SimCfnDeliverySourceCreator;
  readonly deliveryDestinations: SimCfnDeliveryDestinationCreator;
  readonly deliveries: SimCfnDeliveryCreator;
}

/**
 * Removes the simulated CloudWatch Logs resources a Stack created.
 *
 * Each Resource type is given back to whatever created it. A deletion
 * therefore goes through the same command a caller would have used.
 */
export class SimLogsCfnResourceDeleter {
  readonly #creators: SimLogsCfnResourceDeleterProperties;

  constructor(properties: SimLogsCfnResourceDeleterProperties) {
    this.#creators = properties;
  }

  /**
   * Delete the resource a CloudFormation Resource created.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
    options?: SimCfnResourceCallerOptions,
  ): Promise<void> {
    switch (resourceTypeName) {
      case "LogGroup": {
        await this.#creators.logGroups.delete(
          created<SimLogsLogGroup>(resource),
          options,
        );

        return;
      }
      case "DeliverySource": {
        await this.#creators.deliverySources.delete(
          created<SimLogsDeliverySource>(resource),
          options,
        );

        return;
      }
      case "DeliveryDestination": {
        await this.#creators.deliveryDestinations.delete(
          created<SimLogsDeliveryDestination>(resource),
          options,
        );

        return;
      }
      case "Delivery": {
        await this.#creators.deliveries.delete(
          created<SimLogsDelivery>(resource),
          options,
        );

        return;
      }
      default: {
        throw unsupportedSimLogsResourceType(resourceTypeName, " deletion");
      }
    }
  }
}

/**
 * The simulated resource a CloudFormation Resource was created as.
 */
function created<T>(resource: SimCfnResource): T {
  const simResource = resource.simResource as T | undefined;

  assertDefined(
    simResource,
    `sim CloudWatch Logs resource for CloudFormation Resource ${resource.logicalId}`,
  );

  return simResource;
}
