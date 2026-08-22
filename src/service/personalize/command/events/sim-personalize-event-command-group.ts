import type { SimPersonalizeEventRecords } from "../../event/sim-personalize-event-records.js";
import {
  SimPersonalizeInvalidInputException,
  SimPersonalizeResourceNotFoundException,
} from "../../error/sim-personalize.error.js";
import type { SimPersonalizeDataset } from "../../resource/sim-personalize-dataset.js";
import type { SimPersonalizeDatasetType } from "../../resource/sim-personalize-dataset-type.js";
import type { SimPersonalizeEventTracker } from "../../resource/sim-personalize-event-tracker.js";
import {
  SimPersonalizeCommandGroup,
  type SimPersonalizeCommandGroupProperties,
} from "../sim-personalize-command-group.js";
import type { SimPersonalizeRequestOptions } from "../sim-personalize-request-options.js";

export interface SimPersonalizeEventCommandGroupProperties extends SimPersonalizeCommandGroupProperties {
  readonly records: SimPersonalizeEventRecords;
}

/**
 * What the three simulated Personalize Events handlers are built over.
 *
 * All three record what they are sent, and two of them address a dataset of a
 * particular type, so the records and that lookup live here.
 */
export abstract class SimPersonalizeEventCommandGroup extends SimPersonalizeCommandGroup {
  protected readonly records: SimPersonalizeEventRecords;

  constructor(properties: SimPersonalizeEventCommandGroupProperties) {
    super(properties);
    this.records = properties.records;
  }

  /**
   * Read the event tracker a tracking ID names, authorizing against it first.
   *
   * The request carries an ID rather than an ARN, so the tracker has to be
   * found before the caller can be authorized against it. Authorization still
   * comes first in what the caller learns. An ID no tracker holds authorizes
   * against `*`, and a caller a policy allows nothing on is told it has no
   * permission rather than told the tracker is missing.
   */
  protected eventTracker(
    trackingId: string,
    action: string,
    options: SimPersonalizeRequestOptions | undefined,
  ): SimPersonalizeEventTracker {
    const found = this.resources.eventTrackers.all.find(
      (eventTracker) => eventTracker.trackingId === trackingId,
    );

    this.authorizer.authorize(action, options, found?.arn);

    if (found === undefined) {
      throw new SimPersonalizeResourceNotFoundException(
        `Personalize can't find an event tracker with the tracking ID ` +
          `'${trackingId}'`,
      );
    }

    return found;
  }

  /**
   * Read the dataset a request names, refusing one of the wrong type.
   *
   * `PutItems` addresses an Items dataset and `PutUsers` a Users dataset. An
   * ARN naming the Interactions dataset of the same group is the mistake worth
   * catching, and it would otherwise record metadata nothing would ever read.
   */
  protected datasetOfType(
    datasetArn: string | undefined,
    datasetType: SimPersonalizeDatasetType,
    action: string,
    options: SimPersonalizeRequestOptions | undefined,
  ): SimPersonalizeDataset {
    const dataset = this.resolve(
      this.resources.datasets,
      datasetArn,
      action,
      options,
    );

    if (dataset.datasetType !== datasetType) {
      throw new SimPersonalizeInvalidInputException(
        `'${dataset.arn}' is a ${dataset.datasetType} dataset. ` +
          `${action.replace("personalize:", "")} needs a ${datasetType} one.`,
      );
    }

    return dataset;
  }
}
