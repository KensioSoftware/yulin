import type { SimLogsDeliveryDestination } from "../../delivery/sim-logs-delivery-destination.js";
import type { SimLogsDeliveryStore } from "../../delivery/sim-logs-delivery-store.js";
import { SimLogsConflictException } from "../../error/sim-logs.error.js";

/**
 * Refuse deleting a delivery source a delivery still carries logs from.
 *
 * Real CloudWatch Logs refuses the same, and points a caller at
 * `DescribeDeliveries` to find out which delivery is holding on to it. The
 * delivery goes first, and in a template CloudFormation orders that itself.
 */
export function refuseSimLogsDeliverySourceInUse(
  deliveries: SimLogsDeliveryStore,
  name: string,
): void {
  const held = deliveries.all.some(
    (delivery) => delivery.deliverySourceName === name,
  );

  if (held) {
    throw new SimLogsConflictException(
      `Delivery source '${name}' cannot be deleted while a delivery is ` +
        `associated with it`,
    );
  }
}

/**
 * Refuse deleting a delivery destination a delivery still writes to.
 */
export function refuseSimLogsDeliveryDestinationInUse(
  deliveries: SimLogsDeliveryStore,
  destination: SimLogsDeliveryDestination,
): void {
  const held = deliveries.all.some(
    (delivery) => delivery.deliveryDestinationArn === destination.arn,
  );

  if (held) {
    throw new SimLogsConflictException(
      `Delivery destination '${destination.name}' cannot be deleted while a ` +
        `delivery is associated with it`,
    );
  }
}
