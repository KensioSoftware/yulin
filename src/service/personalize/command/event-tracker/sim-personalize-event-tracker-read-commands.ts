import {
  simPersonalizeEventTrackerDetail,
  simPersonalizeEventTrackerSummary,
} from "../../view/sim-personalize-event-tracker-view.js";
import { simPersonalizePageOf } from "../list/sim-personalize-page.js";
import { SimPersonalizeCommandGroup } from "../sim-personalize-command-group.js";
import type { SimPersonalizeRequestOptions } from "../sim-personalize-request-options.js";
import type {
  SimDescribeEventTrackerCommand,
  SimDescribeEventTrackerCommandOutput,
  SimListEventTrackersCommand,
  SimListEventTrackersCommandOutput,
} from "./event-tracker.command.js";

/**
 * The simulated Personalize event tracker commands that only read.
 */
export class SimPersonalizeEventTrackerReadCommands extends SimPersonalizeCommandGroup {
  /** Handle a DescribeEventTracker command. */
  describe(
    command: SimDescribeEventTrackerCommand,
    options?: SimPersonalizeRequestOptions,
  ): SimDescribeEventTrackerCommandOutput {
    const eventTracker = this.resolve(
      this.resources.eventTrackers,
      command.input.eventTrackerArn,
      "personalize:DescribeEventTracker",
      options,
    );

    return {
      eventTracker: simPersonalizeEventTrackerDetail(
        eventTracker,
        this.accountRegionScope.accountId,
      ),
      $metadata: {},
    };
  }

  /** Handle a ListEventTrackers command. */
  list(
    command: SimListEventTrackersCommand,
    options?: SimPersonalizeRequestOptions,
  ): SimListEventTrackersCommandOutput {
    this.authorizer.authorize("personalize:ListEventTrackers", options);

    const datasetGroupArn = command.input?.datasetGroupArn;
    const matching = this.resources.eventTrackers.all.filter(
      (eventTracker) =>
        datasetGroupArn === undefined ||
        eventTracker.datasetGroupArn === datasetGroupArn,
    );
    const page = simPersonalizePageOf(matching, command.input);

    return {
      eventTrackers: page.items.map((eventTracker) =>
        simPersonalizeEventTrackerSummary(eventTracker),
      ),
      nextToken: page.nextToken,
      $metadata: {},
    };
  }
}
