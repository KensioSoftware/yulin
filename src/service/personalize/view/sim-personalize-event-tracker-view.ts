import type {
  SimPersonalizeEventTrackerDetail,
  SimPersonalizeEventTrackerSummary,
} from "../command/event-tracker/event-tracker.command.js";
import type { SimPersonalizeEventTracker } from "../resource/sim-personalize-event-tracker.js";

/**
 * An event tracker as Describe reports it.
 */
export function simPersonalizeEventTrackerDetail(
  eventTracker: SimPersonalizeEventTracker,
  accountId: string,
): SimPersonalizeEventTrackerDetail {
  return {
    ...simPersonalizeEventTrackerSummary(eventTracker),
    accountId,
    trackingId: eventTracker.trackingId,
    datasetGroupArn: eventTracker.datasetGroupArn,
  };
}

/**
 * An event tracker as List reports it.
 */
export function simPersonalizeEventTrackerSummary(
  eventTracker: SimPersonalizeEventTracker,
): SimPersonalizeEventTrackerSummary {
  return {
    name: eventTracker.name,
    eventTrackerArn: eventTracker.arn,
    status: eventTracker.status,
    creationDateTime: eventTracker.creationDateTime,
    lastUpdatedDateTime: eventTracker.lastUpdatedDateTime,
  };
}
