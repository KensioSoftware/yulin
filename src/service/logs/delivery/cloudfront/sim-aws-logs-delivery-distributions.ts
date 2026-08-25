import { parseSimArn } from "../../../aws/arn.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimAws } from "../../../aws/sim-aws.js";
import type { SimLogsDeliverySourceResources } from "../sim-logs-delivery-source-resources.js";
import { simLogsCloudFrontDeliveryService } from "../sim-logs-delivery-source-service.js";

interface SimAwsLogsDeliveryDistributionsProperties {
  readonly simAws: SimAws;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * The simulated CloudFront a delivery source's `resourceArn` is resolved in.
 *
 * CloudFront is the one delivered service resolved here, because it is the one
 * whose delivery rules are modelled at all. An ARN of any other service is
 * left alone, and a source over it is stored on the shape of the ARN alone, as
 * it always was.
 *
 * The distribution is looked up as the source is put, and nothing holds onto
 * it. A distribution deleted afterwards leaves the source standing, the way
 * real CloudWatch Logs leaves it. CloudFront is account-scoped, and the lookup
 * covers the whole account whichever region the request was made in.
 */
export class SimAwsLogsDeliveryDistributions implements SimLogsDeliverySourceResources {
  readonly #simAws: SimAws;
  readonly #scope: SimAwsAccountRegionScope;

  constructor(properties: SimAwsLogsDeliveryDistributionsProperties) {
    this.#simAws = properties.simAws;
    this.#scope = properties.accountRegionScope;
  }

  /**
   * Why the account cannot deliver logs from the distribution an ARN names.
   *
   * The account segment is read before the distribution is looked up. An ARN
   * naming another account is a mistake of its own, and an id that happens to
   * match one this account holds would otherwise carry it through.
   */
  refusalFor(resourceArn: string): string | undefined {
    const arn = parseSimArn(resourceArn);

    if (arn === undefined || arn.service !== simLogsCloudFrontDeliveryService) {
      return undefined;
    }

    const accountId = this.#scope.accountId;

    if (arn.accountId !== accountId) {
      return (
        `resourceArn '${resourceArn}' names account ${arn.accountId}, and a ` +
        `delivery source is over a resource of the account creating it, ` +
        `which is ${accountId}`
      );
    }

    const distribution = this.#simAws
      .accountRegionScope(accountId, this.#scope.regionName)
      .cloudFront()
      .getSimDistributionById(arn.resourceId);

    if (distribution !== undefined) {
      return undefined;
    }

    return (
      `resourceArn '${resourceArn}' names no CloudFront distribution in ` +
      `account ${accountId}. Create the distribution before the delivery ` +
      `source, or name it from the template so the id it was given is ` +
      `substituted into the ARN`
    );
  }
}
