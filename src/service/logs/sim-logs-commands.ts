import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimLogsAuthorizer } from "./command/authorize/sim-logs-authorizer.js";
import { SimLogsDeliveryCommands } from "./command/delivery/sim-logs-delivery-commands.js";
import { SimLogsDeliveryDestinationCommands } from "./command/delivery/sim-logs-delivery-destination-commands.js";
import { SimLogsDeliverySourceCommands } from "./command/delivery/sim-logs-delivery-source-commands.js";
import { SimLogsDeliveryDestinationStore } from "./delivery/sim-logs-delivery-destination-store.js";
import {
  type SimLogsDeliverySourceResources,
  SimLogsUncheckedDeliverySourceResources,
} from "./delivery/sim-logs-delivery-source-resources.js";
import { SimLogsDeliverySourceStore } from "./delivery/sim-logs-delivery-source-store.js";
import { SimLogsDeliveryStore } from "./delivery/sim-logs-delivery-store.js";
import { SimLogsFilterLogEvents } from "./command/event/sim-logs-filter-log-events.js";
import { SimLogsGetLogEvents } from "./command/event/sim-logs-get-log-events.js";
import { SimLogsPutLogEvents } from "./command/event/sim-logs-put-log-events.js";
import { SimLogsLogGroupCommands } from "./command/group/sim-logs-log-group-commands.js";
import { SimLogsRetentionCommands } from "./command/group/sim-logs-retention-commands.js";
import { SimLogsLogStreamCommands } from "./command/stream/sim-logs-log-stream-commands.js";
import { SimLogsSubscriptionCommands } from "./command/subscription/sim-logs-subscription-commands.js";
import { SimLogsEventIds } from "./event/sim-logs-event-ids.js";
import { SimLogsLogGroupStore } from "./group/sim-logs-log-group-store.js";
import {
  SimLogsNoSubscriptionDestinations,
  type SimLogsSubscriptionDestinations,
} from "./subscription/sim-logs-subscription-destinations.js";
import { SimLogsSubscriptionFanOut } from "./subscription/sim-logs-subscription-fan-out.js";
import { SimLogsServiceWriter } from "./write/sim-logs-service-writer.js";

export interface SimLogsProperties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;

  /**
   * Where subscription filters deliver to. A SimLogs built on its own has no
   * other simulated services to reach, so it holds filters and delivers to
   * none of them.
   */
  readonly subscriptionDestinations?: SimLogsSubscriptionDestinations;

  /**
   * What a delivery source's `resourceArn` is resolved against. A SimLogs
   * built on its own has no simulated CloudFront to find a distribution in. It
   * takes any ARN, the way it always did.
   */
  readonly deliverySourceResources?: SimLogsDeliverySourceResources;
}

/**
 * The collaborators one simulated CloudWatch Logs scope is built from.
 *
 * Held apart from SimLogs for the same reason simulated Lambda holds its own:
 * the facade is one method per SDK Command and grows by one with every
 * operation added, so the wiring deciding what those methods delegate to needs
 * somewhere it is not competing for room with them.
 */
export class SimLogsCommands {
  readonly groups: SimLogsLogGroupStore;
  readonly logGroups: SimLogsLogGroupCommands;
  readonly retention: SimLogsRetentionCommands;
  readonly streams: SimLogsLogStreamCommands;
  readonly putLogEvents: SimLogsPutLogEvents;
  readonly getLogEvents: SimLogsGetLogEvents;
  readonly filterLogEvents: SimLogsFilterLogEvents;
  readonly subscriptions: SimLogsSubscriptionCommands;
  readonly serviceWriter: SimLogsServiceWriter;
  readonly fanOut: SimLogsSubscriptionFanOut;
  readonly deliverySourceStore: SimLogsDeliverySourceStore;
  readonly deliveryDestinationStore: SimLogsDeliveryDestinationStore;
  readonly deliveryStore: SimLogsDeliveryStore;
  readonly deliverySources: SimLogsDeliverySourceCommands;
  readonly deliveryDestinations: SimLogsDeliveryDestinationCommands;
  readonly deliveries: SimLogsDeliveryCommands;
  readonly background: BackgroundScheduler;

  constructor(properties: SimLogsProperties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
      subscriptionDestinations = new SimLogsNoSubscriptionDestinations(),
      deliverySourceResources = new SimLogsUncheckedDeliverySourceResources(),
    } = properties;

    const authorizer = new SimLogsAuthorizer({ iam, accountRegionScope });
    const groups = new SimLogsLogGroupStore({ accountRegionScope });
    const eventIds = new SimLogsEventIds();
    const fanOut = new SimLogsSubscriptionFanOut({
      destinations: subscriptionDestinations,
      accountRegionScope,
      background,
    });

    this.background = background;
    this.groups = groups;
    this.fanOut = fanOut;
    this.logGroups = new SimLogsLogGroupCommands({
      groups,
      authorizer,
      clock: background,
    });
    this.retention = new SimLogsRetentionCommands({ groups, authorizer });
    this.streams = new SimLogsLogStreamCommands({
      groups,
      authorizer,
      clock: background,
    });
    this.putLogEvents = new SimLogsPutLogEvents({
      groups,
      authorizer,
      eventIds,
      clock: background,
      fanOut,
    });
    this.getLogEvents = new SimLogsGetLogEvents({ groups, authorizer });
    this.filterLogEvents = new SimLogsFilterLogEvents({ groups, authorizer });
    this.subscriptions = new SimLogsSubscriptionCommands({
      groups,
      authorizer,
      destinations: subscriptionDestinations,
      clock: background,
    });
    this.serviceWriter = new SimLogsServiceWriter({
      groups,
      eventIds,
      clock: background,
      fanOut,
    });

    const deliverySources = new SimLogsDeliverySourceStore();
    const deliveryDestinations = new SimLogsDeliveryDestinationStore();
    const deliveries = new SimLogsDeliveryStore();

    this.deliverySourceStore = deliverySources;
    this.deliveryDestinationStore = deliveryDestinations;
    this.deliveryStore = deliveries;
    this.deliverySources = new SimLogsDeliverySourceCommands({
      sources: deliverySources,
      deliveries,
      authorizer,
      accountRegionScope,
      resources: deliverySourceResources,
    });
    this.deliveryDestinations = new SimLogsDeliveryDestinationCommands({
      destinations: deliveryDestinations,
      deliveries,
      authorizer,
      accountRegionScope,
    });
    this.deliveries = new SimLogsDeliveryCommands({
      sources: deliverySources,
      destinations: deliveryDestinations,
      deliveries,
      authorizer,
      accountRegionScope,
    });
  }
}
