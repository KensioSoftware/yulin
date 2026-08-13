import type { SimEventBus } from "../../bus/sim-event-bus.js";
import type { SimListedEventBus } from "./bus.command.js";

/**
 * One bus as a describe or a listing reports it.
 *
 * Both report the same fields, so both build them here rather than each
 * writing the mapping out and drifting from the other.
 *
 * `LastModifiedTime` is the creation time, because nothing modifies a bus:
 * there is no UpdateEventBus in this simulation, and a bus's description is
 * fixed when it is created.
 */
export function listedEventBus(bus: SimEventBus): SimListedEventBus {
  return {
    Name: bus.name.value,
    Arn: bus.arn.value,
    Description: bus.description,
    CreationTime: bus.creationTime,
    LastModifiedTime: bus.creationTime,
  };
}

/**
 * The buses a listing reports, narrowed to a name prefix when one is asked
 * for.
 *
 * Real EventBridge matches the prefix against the name rather than the ARN, so
 * the default bus drops out of any listing whose prefix it does not start
 * with.
 */
export function listedEventBuses(
  buses: readonly SimEventBus[],
  namePrefix: string | undefined,
): readonly SimListedEventBus[] {
  if (namePrefix === undefined) {
    return buses.map(listedEventBus);
  }

  return buses
    .filter((bus) => bus.name.value.startsWith(namePrefix))
    .map(listedEventBus);
}
