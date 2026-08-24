import type { SimLogsDeliveryDestination } from "../../delivery/sim-logs-delivery-destination.js";
import type { SimLogsDeliverySource } from "../../delivery/sim-logs-delivery-source.js";
import type { SimLogsDelivery } from "../../delivery/sim-logs-delivery.js";
import type { SimLogsDeliveryDestinationDetail } from "./delivery-destination.command.js";
import type { SimLogsDeliverySourceDetail } from "./delivery-source.command.js";
import type {
  SimLogsDeliveryDetail,
  SimLogsS3DeliveryConfiguration,
} from "./delivery.command.js";

/**
 * What DescribeDeliverySources reports about one delivery source.
 */
export function simLogsDeliverySourceDetail(
  source: SimLogsDeliverySource,
): SimLogsDeliverySourceDetail {
  return {
    name: source.name,
    arn: source.arn,
    resourceArns: source.resourceArns,
    service: source.service,
    logType: source.logType,
  };
}

/**
 * What DescribeDeliveryDestinations reports about one delivery destination.
 */
export function simLogsDeliveryDestinationDetail(
  destination: SimLogsDeliveryDestination,
): SimLogsDeliveryDestinationDetail {
  return {
    name: destination.name,
    arn: destination.arn,
    deliveryDestinationType: destination.destinationType,
    outputFormat: destination.outputFormat,
    deliveryDestinationConfiguration: {
      destinationResourceArn: destination.destinationResourceArn,
    },
  };
}

/**
 * What DescribeDeliveries reports about one delivery.
 */
export function simLogsDeliveryDetail(
  delivery: SimLogsDelivery,
): SimLogsDeliveryDetail {
  return {
    id: delivery.id,
    arn: delivery.arn,
    deliverySourceName: delivery.deliverySourceName,
    deliveryDestinationArn: delivery.deliveryDestinationArn,
    deliveryDestinationType: delivery.deliveryDestinationType,
    recordFields: delivery.recordFields,
    fieldDelimiter: delivery.fieldDelimiter,
    s3DeliveryConfiguration: s3DeliveryConfigurationDetail(delivery),
  };
}

function s3DeliveryConfigurationDetail(
  delivery: SimLogsDelivery,
): SimLogsS3DeliveryConfiguration | undefined {
  const configuration = delivery.s3DeliveryConfiguration;

  if (configuration === undefined) {
    return undefined;
  }

  return {
    suffixPath: configuration.suffixPath,
    enableHiveCompatiblePath: configuration.enableHiveCompatiblePath,
  };
}
