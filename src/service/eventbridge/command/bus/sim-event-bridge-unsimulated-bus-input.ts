import {
  SimEventBridgeUnsimulatedInputException,
  SimEventBridgeValidationException,
} from "../../error/sim-event-bridge.error.js";
import type { SimCreateEventBusCommandInput } from "./bus.command.js";

/**
 * The maximum length real EventBridge takes for an event bus description.
 */
const maximumDescriptionLength = 512;

/**
 * One property this simulation does not model, read straight off the input
 * rather than by key, and what refusing it should say.
 */
type SimEventBridgeBusRefusal = readonly [
  (input: SimCreateEventBusCommandInput) => unknown,
  string,
];

/**
 * What a CreateEventBus input carrying an unmodelled property is refused with.
 */
const refusals: readonly SimEventBridgeBusRefusal[] = [
  [
    (input): unknown => input.EventSourceName,
    "Partner event buses are not simulated, so CreateEventBus refuses an " +
      "EventSourceName rather than creating a bus no partner can reach",
  ],
  [
    (input): unknown => input.KmsKeyIdentifier,
    "Event bus encryption with a customer managed key is not simulated, so " +
      "CreateEventBus refuses a KmsKeyIdentifier rather than creating a bus " +
      "that encrypts nothing",
  ],
  [
    (input): unknown => input.DeadLetterConfig,
    "Event bus dead letter queues are not simulated, so CreateEventBus " +
      "refuses a DeadLetterConfig rather than creating a bus that drops " +
      "undelivered events silently",
  ],
  [
    (input): unknown => input.LogConfig,
    "Event bus logging is not simulated, so CreateEventBus refuses a " +
      "LogConfig rather than creating a bus that logs nothing",
  ],
  [
    (input): unknown => input.Tags,
    "Event bus tags are not simulated, so CreateEventBus refuses them rather " +
      "than dropping them",
  ],
];

/**
 * Refuse the event bus request inputs this simulation does not model.
 *
 * Each is refused rather than ignored. A dropped tag would leave a bus looking
 * tagged to the request that sent it and untagged to everything else, and a
 * dead letter queue that received nothing would be one a test believed was
 * catching undelivered events.
 */
export function refuseUnsimulatedBusInput(
  input: SimCreateEventBusCommandInput,
): void {
  for (const [read, message] of refusals) {
    if (read(input) !== undefined) {
      throw new SimEventBridgeUnsimulatedInputException(message);
    }
  }

  refuseOverlongDescription(input.Description);
}

/**
 * Refuse a description real EventBridge would refuse.
 */
function refuseOverlongDescription(description: string | undefined): void {
  if (
    description !== undefined &&
    description.length > maximumDescriptionLength
  ) {
    throw new SimEventBridgeValidationException(
      `Invalid parameter: Description Reason: a description is at most ${String(maximumDescriptionLength)} characters, and this one is ${String(description.length)}`,
    );
  }
}
