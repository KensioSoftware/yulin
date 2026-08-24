import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { simLogsDeliveryArn } from "./sim-logs-delivery-arn.js";
import type { SimLogsDeliveryDestinationType } from "./sim-logs-delivery-destination-type.js";
import type { SimLogsDeliveryS3Configuration } from "./sim-logs-delivery-s3-configuration.js";

interface SimLogsDeliveryProperties {
  readonly id: string;
  readonly deliverySourceName: string;
  readonly deliveryDestinationArn: string;
  readonly deliveryDestinationType: SimLogsDeliveryDestinationType;
  readonly recordFields: readonly string[] | undefined;
  readonly fieldDelimiter: string | undefined;
  readonly s3DeliveryConfiguration: SimLogsDeliveryS3Configuration | undefined;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * One delivery: the join between a source and a destination.
 *
 * Nothing here moves any logs. The delivery records that a source was joined
 * to a destination and how the records would be written, which is what a test
 * of a construct that sets logging up has to assert on.
 */
export class SimLogsDelivery {
  readonly id: string;
  readonly deliverySourceName: string;
  readonly deliveryDestinationArn: string;
  readonly deliveryDestinationType: SimLogsDeliveryDestinationType;
  readonly recordFields: readonly string[] | undefined;
  readonly fieldDelimiter: string | undefined;
  readonly s3DeliveryConfiguration: SimLogsDeliveryS3Configuration | undefined;
  readonly arn: string;

  constructor(properties: SimLogsDeliveryProperties) {
    this.id = properties.id;
    this.deliverySourceName = properties.deliverySourceName;
    this.deliveryDestinationArn = properties.deliveryDestinationArn;
    this.deliveryDestinationType = properties.deliveryDestinationType;
    // Copied, because the list arrives from the caller's own command input and
    // nothing stops them holding on to it and changing it afterwards.
    this.recordFields =
      properties.recordFields === undefined
        ? undefined
        : [...properties.recordFields];
    this.fieldDelimiter = properties.fieldDelimiter;
    this.s3DeliveryConfiguration = properties.s3DeliveryConfiguration;
    this.arn = simLogsDeliveryArn(properties.accountRegionScope, properties.id);
  }
}
