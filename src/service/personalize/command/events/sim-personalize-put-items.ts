import { SimPersonalizeRecordedItem } from "../../event/sim-personalize-recorded-item.js";
import { SimPersonalizeUnsimulatedInput } from "../sim-personalize-unsimulated-input.js";
import type { SimPersonalizeRequestOptions } from "../sim-personalize-request-options.js";
import type {
  SimPutItemsCommand,
  SimPutItemsCommandOutput,
} from "./events.command.js";
import { SimPersonalizeEventCommandGroup } from "./sim-personalize-event-command-group.js";
import {
  readSimPersonalizeProperties,
  requireSimPersonalizeBatch,
  requireSimPersonalizeField,
} from "./sim-personalize-event-input.js";

const action = "personalize:PutItems";

const accepted = ["datasetArn", "items"];

const acceptedItem = ["itemId", "properties"];

const unsimulated = new SimPersonalizeUnsimulatedInput("PutItems");

/**
 * Handles a PutItems command.
 *
 * This is how a catalogue update reaches Personalize between import jobs. The
 * items are recorded and read back through `personalize().recordedItems()`.
 * The Items dataset itself stays empty, as every simulated dataset does.
 */
export class SimPersonalizePutItemsHandler extends SimPersonalizeEventCommandGroup {
  /**
   * Record the items a request carries.
   */
  handle(
    command: SimPutItemsCommand,
    options?: SimPersonalizeRequestOptions,
  ): SimPutItemsCommandOutput {
    const { input } = command;

    unsimulated.refuseUnaccepted(input, accepted);

    const dataset = this.datasetOfType(
      input.datasetArn,
      "ITEMS",
      action,
      options,
    );
    const items = requireSimPersonalizeBatch(input.items, "items");
    const recordedAt = this.clock.now();

    this.records.addItems(
      items.map((item) => {
        unsimulated.refuseUnaccepted(item, acceptedItem);

        return new SimPersonalizeRecordedItem({
          datasetArn: dataset.arn,
          itemId: requireSimPersonalizeField(item.itemId, "itemId"),
          properties: readSimPersonalizeProperties(item.properties),
          recordedAt,
        });
      }),
    );

    return { $metadata: {} };
  }
}
