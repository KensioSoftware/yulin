import { randomUUID } from "node:crypto";

import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { SimEventBridgeEvent } from "../event/sim-event-bridge-event.js";
import type { SimEventRule } from "../rule/sim-event-rule.js";

/**
 * The source every scheduled event carries, as AWS's own events do.
 */
export const simEventBridgeScheduledEventSource = "aws.events";

/**
 * The detail type every scheduled event carries.
 */
export const simEventBridgeScheduledEventDetailType = "Scheduled Event";

interface SimEventBridgeScheduledEventProperties {
  readonly rule: SimEventRule;
  readonly at: Date;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * The event a scheduled rule sends to its targets when it falls due.
 *
 * There is nothing of the caller's in it, because nothing of the caller's
 * caused it: the detail is empty, and the only thing naming what fired is the
 * rule's own ARN in `resources`. A target wanting more than that is what a
 * target `Input` is for.
 *
 * The timestamp is the instant the rule fell due rather than the instant the
 * work ran. AWS's advice for a scheduled invocation is to read the event's time
 * rather than the clock, because a delayed delivery runs later than the time
 * the work was for, and that only holds if the event says when it was for.
 */
export function simEventBridgeScheduledEvent(
  properties: SimEventBridgeScheduledEventProperties,
): SimEventBridgeEvent {
  return new SimEventBridgeEvent({
    id: randomUUID(),
    detailType: simEventBridgeScheduledEventDetailType,
    source: simEventBridgeScheduledEventSource,
    account: properties.accountRegionScope.accountId,
    time: new Date(properties.at),
    region: properties.accountRegionScope.regionName,
    resources: [properties.rule.arn],
    detail: {},
  });
}
