import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { simLogsDeliveryDestinationArn } from "./sim-logs-delivery-arn.js";
import type { SimLogsDeliveryDestinationType } from "./sim-logs-delivery-destination-type.js";
import type { SimLogsDeliveryOutputFormat } from "./sim-logs-delivery-output-format.js";

interface SimLogsDeliveryDestinationProperties {
  readonly name: string;
  readonly destinationResourceArn: string;
  readonly destinationType: SimLogsDeliveryDestinationType;
  readonly outputFormat: SimLogsDeliveryOutputFormat;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * One delivery destination: where logs land, and in what form.
 *
 * The destination has its own ARN, which is what a delivery names. The bucket
 * or log group behind it keeps its own, so the two ARNs in play here are easy
 * to confuse and mean different things.
 */
export class SimLogsDeliveryDestination {
  readonly name: string;
  readonly destinationResourceArn: string;
  readonly destinationType: SimLogsDeliveryDestinationType;
  readonly outputFormat: SimLogsDeliveryOutputFormat;
  readonly arn: string;

  constructor(properties: SimLogsDeliveryDestinationProperties) {
    this.name = properties.name;
    this.destinationResourceArn = properties.destinationResourceArn;
    this.destinationType = properties.destinationType;
    this.outputFormat = properties.outputFormat;
    this.arn = simLogsDeliveryDestinationArn(
      properties.accountRegionScope,
      properties.name,
    );
  }
}
