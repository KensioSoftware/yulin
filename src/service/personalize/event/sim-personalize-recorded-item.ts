export interface SimPersonalizeRecordedItemProperties {
  readonly datasetArn: string;
  readonly itemId: string;
  readonly properties: string | undefined;
  readonly recordedAt: Date;
}

/**
 * One item a `PutItems` has added to a simulated Items dataset.
 *
 * The dataset itself stays empty. Simulated Personalize reads no dataset, so
 * the item is kept here instead and read back through
 * `personalize().recordedItems()`.
 */
export class SimPersonalizeRecordedItem {
  /** The Items dataset the request named. */
  public readonly datasetArn: string;

  public readonly itemId: string;

  /** The item's metadata, as the JSON string the request carried. */
  public readonly properties: string | undefined;

  /** When simulated Personalize accepted the item, from the simulated clock. */
  public readonly recordedAt: Date;

  constructor(properties: SimPersonalizeRecordedItemProperties) {
    this.datasetArn = properties.datasetArn;
    this.itemId = properties.itemId;
    this.properties = properties.properties;
    this.recordedAt = properties.recordedAt;
  }
}
