import { SimPersonalizeRecordedEvent } from "../../event/sim-personalize-recorded-event.js";
import { SimPersonalizeUnsimulatedInput } from "../sim-personalize-unsimulated-input.js";
import type { SimPersonalizeRequestOptions } from "../sim-personalize-request-options.js";
import type {
  SimPersonalizeEventInput,
  SimPutEventsCommand,
  SimPutEventsCommandOutput,
} from "./events.command.js";
import { SimPersonalizeEventCommandGroup } from "./sim-personalize-event-command-group.js";
import {
  readSimPersonalizeProperties,
  requireSimPersonalizeBatch,
  requireSimPersonalizeField,
} from "./sim-personalize-event-input.js";

const action = "personalize:PutEvents";

const accepted = ["trackingId", "userId", "sessionId", "eventList"];

/**
 * Everything an event carries that simulated Personalize records.
 *
 * `metricAttribution` is left out. It ties an event to a metric attribution
 * report, and simulated Personalize has no `CreateMetricAttribution` and no
 * reports to tie it to.
 */
const acceptedEvent = [
  "eventId",
  "eventType",
  "eventValue",
  "itemId",
  "properties",
  "sentAt",
  "recommendationId",
  "impression",
];

const unsimulated = new SimPersonalizeUnsimulatedInput("PutEvents");

/**
 * Handles a PutEvents command.
 *
 * Real Personalize appends the interactions to the Interactions dataset behind
 * the tracker, and a later training run reads them. Simulated Personalize
 * records them and reads them back through `personalize().recordedEvents()`.
 * No recommendation moves as a result.
 */
export class SimPersonalizePutEventsHandler extends SimPersonalizeEventCommandGroup {
  /**
   * Record the interactions a request carries.
   */
  handle(
    command: SimPutEventsCommand,
    options?: SimPersonalizeRequestOptions,
  ): SimPutEventsCommandOutput {
    const { input } = command;

    unsimulated.refuseUnaccepted(input, accepted);

    const trackingId = requireSimPersonalizeField(
      input.trackingId,
      "trackingId",
    );
    const sessionId = requireSimPersonalizeField(input.sessionId, "sessionId");
    const eventTracker = this.eventTracker(trackingId, action, options);
    const eventList = requireSimPersonalizeBatch(input.eventList, "eventList");

    this.records.addEvents(
      eventList.map((event) =>
        this.recorded(event, {
          trackingId,
          eventTrackerArn: eventTracker.arn,
          sessionId,
          userId: input.userId,
        }),
      ),
    );

    return { $metadata: {} };
  }

  private recorded(
    event: SimPersonalizeEventInput,
    session: {
      readonly trackingId: string;
      readonly eventTrackerArn: string;
      readonly sessionId: string;
      readonly userId: string | undefined;
    },
  ): SimPersonalizeRecordedEvent {
    unsimulated.refuseUnaccepted(event, acceptedEvent);

    return new SimPersonalizeRecordedEvent({
      ...session,
      eventId: event.eventId,
      eventType: requireSimPersonalizeField(event.eventType, "eventType"),
      eventValue: event.eventValue,
      itemId: event.itemId,
      properties: readSimPersonalizeProperties(event.properties),
      // Real Personalize requires the client to timestamp every event. A
      // request that leaves it out is stamped from the simulated clock, so a
      // test asserting on when an interaction happened controls it the same
      // way it controls every other simulated timestamp.
      sentAt: event.sentAt ?? this.clock.now(),
      recommendationId: event.recommendationId,
      impression: event.impression,
    });
  }
}
