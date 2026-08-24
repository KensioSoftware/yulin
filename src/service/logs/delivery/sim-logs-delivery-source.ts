import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { simLogsDeliverySourceArn } from "./sim-logs-delivery-arn.js";

interface SimLogsDeliverySourceProperties {
  readonly name: string;
  readonly resourceArn: string;
  readonly logType: string;
  readonly service: string;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * One delivery source: what is being logged, and which of its logs.
 *
 * A source names one resource. Real CloudWatch Logs lets a source hold several
 * ARNs in `resourceArns` and has never accepted more than one, which is why
 * the field is a list and this holds a single ARN behind it.
 */
export class SimLogsDeliverySource {
  readonly name: string;
  readonly resourceArn: string;
  readonly logType: string;
  readonly service: string;
  readonly arn: string;

  constructor(properties: SimLogsDeliverySourceProperties) {
    this.name = properties.name;
    this.resourceArn = properties.resourceArn;
    this.logType = properties.logType;
    this.service = properties.service;
    this.arn = simLogsDeliverySourceArn(
      properties.accountRegionScope,
      properties.name,
    );
  }

  /**
   * The resources this source covers, as CloudWatch Logs reports them.
   */
  get resourceArns(): readonly string[] {
    return [this.resourceArn];
  }
}
