import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimLogsDeliveryDestination } from "../../delivery/sim-logs-delivery-destination.js";
import { SimLogsDeliveryS3Configuration } from "../../delivery/sim-logs-delivery-s3-configuration.js";
import { SimLogsDelivery } from "../../delivery/sim-logs-delivery.js";
import { SimLogsValidationException } from "../../error/sim-logs.error.js";
import type {
  SimCreateDeliveryCommandInput,
  SimLogsS3DeliveryConfiguration,
} from "./delivery.command.js";

interface SimLogsCreatedDeliveryProperties {
  readonly id: string;
  readonly deliverySourceName: string;
  readonly destination: SimLogsDeliveryDestination;
  readonly input: SimCreateDeliveryCommandInput;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * The delivery a CreateDelivery request asked for.
 *
 * The destination decides two of the delivery's own fields. Its kind is
 * reported on every delivery that reaches it, and it is what says whether an
 * S3 layout means anything.
 */
export function simLogsCreatedDelivery(
  properties: SimLogsCreatedDeliveryProperties,
): SimLogsDelivery {
  const { input, destination } = properties;

  return new SimLogsDelivery({
    id: properties.id,
    deliverySourceName: properties.deliverySourceName,
    deliveryDestinationArn: destination.arn,
    deliveryDestinationType: destination.destinationType,
    recordFields: input.recordFields,
    fieldDelimiter: input.fieldDelimiter,
    s3DeliveryConfiguration: s3Configuration(
      input.s3DeliveryConfiguration,
      destination,
    ),
    accountRegionScope: properties.accountRegionScope,
  });
}

/**
 * The S3 layout a delivery was asked for, refused where its destination has no
 * keys to lay anything out under.
 */
function s3Configuration(
  configuration: SimLogsS3DeliveryConfiguration | undefined,
  destination: SimLogsDeliveryDestination,
): SimLogsDeliveryS3Configuration | undefined {
  if (configuration === undefined) {
    return undefined;
  }

  if (destination.destinationType !== "S3") {
    throw new SimLogsValidationException(
      `s3DeliveryConfiguration only applies to an S3 delivery destination, ` +
        `and '${destination.name}' is ${destination.destinationType}`,
    );
  }

  return new SimLogsDeliveryS3Configuration({
    suffixPath: configuration.suffixPath,
    enableHiveCompatiblePath: configuration.enableHiveCompatiblePath,
  });
}
