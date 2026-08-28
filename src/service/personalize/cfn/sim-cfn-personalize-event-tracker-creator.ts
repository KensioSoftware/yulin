import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimPersonalizeEventTracker } from "../resource/sim-personalize-event-tracker.js";
import type { SimPersonalizeResources } from "../resource/sim-personalize-resources.js";
import type { SimPersonalize } from "../sim-personalize.js";
import { simCfnPersonalizeCreated } from "./sim-cfn-personalize-created.js";
import { SimCfnPersonalizeProperties } from "./sim-cfn-personalize-properties.js";
import { simCfnPersonalizeResourceCreation } from "./sim-cfn-personalize-resource-error.js";
import { personalizeEventTrackerResourceType } from "./sim-cfn-personalize-resource-types.js";
import type { SimCfnResourceCallerOptions } from "../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

const readProperties = new Set(["Name", "DatasetGroupArn"]);

interface SimCfnPersonalizeEventTrackerCreatorProperties {
  readonly personalize: SimPersonalize;
  readonly resources: SimPersonalizeResources;
}

/**
 * Creates simulated event trackers from AWS::Personalize::EventTracker
 * Resources.
 *
 * The tracking ID a deployed tracker hands out is a fresh UUID, as it is on a
 * tracker an SDK caller created. Read it from the `TrackingId` attribute in a
 * Stack Output, or from `DescribeEventTracker`. A template cannot carry one it
 * wrote down beforehand, and neither can a real one.
 */
export class SimCfnPersonalizeEventTrackerCreator {
  readonly #personalize: SimPersonalize;
  readonly #resources: SimPersonalizeResources;

  constructor(properties: SimCfnPersonalizeEventTrackerCreatorProperties) {
    this.#personalize = properties.personalize;
    this.#resources = properties.resources;
  }

  /** Create a tracker from an AWS::Personalize::EventTracker Resource. */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    options?: SimCfnResourceCallerOptions,
  ): Promise<SimPersonalizeEventTracker> {
    const read = new SimCfnPersonalizeProperties({
      resourceType: personalizeEventTrackerResourceType,
      resource,
      properties,
      read: readProperties,
    });
    const input = {
      name: read.string("Name"),
      datasetGroupArn: read.string("DatasetGroupArn"),
    };

    read.recordUnreadProperties();

    return await simCfnPersonalizeResourceCreation(
      personalizeEventTrackerResourceType,
      resource.logicalId,
      async () => {
        const created = await this.#personalize.createEventTracker(
          { input },
          options,
        );

        return simCfnPersonalizeCreated(
          this.#resources.eventTrackers,
          created.eventTrackerArn,
          "event tracker",
        );
      },
    );
  }

  /** Delete a tracker an AWS::Personalize::EventTracker Resource made. */
  async delete(
    eventTracker: SimPersonalizeEventTracker,
    options?: SimCfnResourceCallerOptions,
  ): Promise<void> {
    await this.#personalize.deleteEventTracker(
      { input: { eventTrackerArn: eventTracker.arn } },
      options,
    );
  }
}
