import { randomUUID } from "node:crypto";
import { SimPersonalizeResourceAlreadyExistsException } from "../../error/sim-personalize.error.js";
import { simPersonalizeEventTrackerArn } from "../../resource/sim-personalize-arn.js";
import { SimPersonalizeEventTracker } from "../../resource/sim-personalize-event-tracker.js";
import { requireSimPersonalizeName } from "../../resource/sim-personalize-name.js";
import { simPersonalizeActiveStatus } from "../../resource/sim-personalize-status.js";
import { SimPersonalizeCommandGroup } from "../sim-personalize-command-group.js";
import type { SimPersonalizeRequestOptions } from "../sim-personalize-request-options.js";
import type {
  SimCreateEventTrackerCommand,
  SimCreateEventTrackerCommandOutput,
  SimDeleteEventTrackerCommand,
  SimDeleteEventTrackerCommandOutput,
} from "./event-tracker.command.js";

/**
 * The simulated Personalize event tracker commands that change state.
 */
export class SimPersonalizeEventTrackerWriteCommands extends SimPersonalizeCommandGroup {
  /**
   * Handle a CreateEventTracker command.
   *
   * Real Personalize allows one event tracker per dataset group and refuses a
   * second against the same group.
   */
  create(
    command: SimCreateEventTrackerCommand,
    options?: SimPersonalizeRequestOptions,
  ): SimCreateEventTrackerCommandOutput {
    this.authorizer.authorize("personalize:CreateEventTracker", options);

    const { input } = command;
    const name = requireSimPersonalizeName(input.name, "event tracker");
    const datasetGroup = this.resources.datasetGroups.require(
      input.datasetGroupArn,
    );

    this.resources.eventTrackers.requireNameAvailable(name);
    this.requireDatasetGroupUntracked(datasetGroup.arn);

    const eventTracker = new SimPersonalizeEventTracker({
      arn: simPersonalizeEventTrackerArn(name, this.accountRegionScope),
      name,
      status: simPersonalizeActiveStatus,
      creationDateTime: this.clock.now(),
      datasetGroupArn: datasetGroup.arn,
      // Real Personalize hands out an opaque id here, and so does this.
      trackingId: randomUUID(),
    });

    this.resources.eventTrackers.add(eventTracker);

    return {
      eventTrackerArn: eventTracker.arn,
      trackingId: eventTracker.trackingId,
      $metadata: {},
    };
  }

  /**
   * Handle a DeleteEventTracker command.
   *
   * The events the tracker accepted stay recorded. Deleting a tracker on real
   * Personalize leaves the interactions it wrote in the dataset behind it.
   */
  delete(
    command: SimDeleteEventTrackerCommand,
    options?: SimPersonalizeRequestOptions,
  ): SimDeleteEventTrackerCommandOutput {
    this.resources.eventTrackers.remove(
      this.resolve(
        this.resources.eventTrackers,
        command.input.eventTrackerArn,
        "personalize:DeleteEventTracker",
        options,
      ),
    );

    return { $metadata: {} };
  }

  private requireDatasetGroupUntracked(datasetGroupArn: string): void {
    const tracked = this.resources.eventTrackers.all.find(
      (eventTracker) => eventTracker.datasetGroupArn === datasetGroupArn,
    );

    if (tracked === undefined) {
      return;
    }

    throw new SimPersonalizeResourceAlreadyExistsException(
      `The dataset group '${datasetGroupArn}' already has the event tracker ` +
        `'${tracked.arn}'. Personalize allows one per dataset group.`,
    );
  }
}
