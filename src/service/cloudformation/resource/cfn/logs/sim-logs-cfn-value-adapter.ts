import { SimLogsDeliveryDestination } from "../../../../logs/delivery/sim-logs-delivery-destination.js";
import { SimLogsDeliverySource } from "../../../../logs/delivery/sim-logs-delivery-source.js";
import { SimLogsDelivery } from "../../../../logs/delivery/sim-logs-delivery.js";
import { SimLogsLogGroup } from "../../../../logs/group/sim-logs-log-group.js";
import type {
  SimCfnResourceValueAdapterProperties,
  SimCfnServiceValueAdapter,
} from "../sim-cfn-resource-value-adapter.js";
import { SimLogsDeliveryDestinationCfn } from "./sim-logs-delivery-destination-cfn.js";
import { SimLogsDeliverySourceCfn } from "./sim-logs-delivery-source-cfn.js";
import { SimLogsDeliveryCfn } from "./sim-logs-delivery-cfn.js";
import { SimLogsLogGroupCfn } from "./sim-logs-log-group-cfn.js";

/**
 * The CloudFormation-facing value adapter for a simulated CloudWatch Logs
 * Resource.
 */
export function logsValueAdapter(
  properties: SimCfnResourceValueAdapterProperties,
): SimCfnServiceValueAdapter {
  const { type, simResource } = properties;

  if (
    type === "AWS::Logs::LogGroup" &&
    simResource instanceof SimLogsLogGroup
  ) {
    return new SimLogsLogGroupCfn({ group: simResource });
  }

  if (
    type === "AWS::Logs::DeliverySource" &&
    simResource instanceof SimLogsDeliverySource
  ) {
    return new SimLogsDeliverySourceCfn({ source: simResource });
  }

  if (
    type === "AWS::Logs::DeliveryDestination" &&
    simResource instanceof SimLogsDeliveryDestination
  ) {
    return new SimLogsDeliveryDestinationCfn({ destination: simResource });
  }

  if (
    type === "AWS::Logs::Delivery" &&
    simResource instanceof SimLogsDelivery
  ) {
    return new SimLogsDeliveryCfn({ delivery: simResource });
  }

  return undefined;
}
