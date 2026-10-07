import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimPartnerEventSourceName } from "./sim-partner-event-source-name.js";

/**
 * The states a partner event source reports.
 *
 * `DELETED` is absent. It belongs to a source the partner deleted while its
 * bus was still there, and nothing here deletes a source.
 */
export type SimPartnerEventSourceState = "ACTIVE" | "PENDING";

/**
 * The ARN of a partner event source, which a request authorizes against
 * before the source is looked up.
 *
 * The ARN carries no Account. The source is the partner's resource, shared
 * with the receiving Account, and real EventBridge writes it with an empty
 * Account field, as the `resources` of a Stripe event show.
 */
export function partnerEventSourceArn(
  name: SimPartnerEventSourceName,
  accountRegionScope: SimAwsAccountRegionScope,
): string {
  return `arn:aws:events:${accountRegionScope.regionName}::event-source/${name.value}`;
}

interface SimPartnerEventSourceProperties {
  readonly name: SimPartnerEventSourceName;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly createdAt: Date;
}

/**
 * One partner event source, shared with a receiving Account and Region.
 *
 * A SaaS partner creates the source from its own Account, naming the Account
 * that may receive from it. The receiving Account activates it by creating a
 * partner event bus under the same name, and the partner's events then land
 * on that bus.
 *
 * The state is worked out from whether that bus exists rather than stored
 * here. Creating the bus is what activates a source on real AWS, and deleting
 * the bus puts it back to pending.
 */
export class SimPartnerEventSource {
  public readonly name: SimPartnerEventSourceName;
  public readonly arn: string;
  public readonly creationTime: Date;

  constructor(properties: SimPartnerEventSourceProperties) {
    const { name, accountRegionScope } = properties;

    this.name = name;
    this.arn = partnerEventSourceArn(name, accountRegionScope);
    this.creationTime = properties.createdAt;
  }

  /**
   * The source's state, given whether a bus of its name exists.
   */
  state(hasBus: boolean): SimPartnerEventSourceState {
    if (hasBus) {
      return "ACTIVE";
    }

    return "PENDING";
  }
}
