export interface SimPersonalizeRecordedUserProperties {
  readonly datasetArn: string;
  readonly userId: string;
  readonly properties: string | undefined;
  readonly recordedAt: Date;
}

/**
 * One user a `PutUsers` has added to a simulated Users dataset.
 *
 * It follows the recorded item. The dataset stays empty and the user is read
 * back through `personalize().recordedUsers()`.
 */
export class SimPersonalizeRecordedUser {
  /** The Users dataset the request named. */
  public readonly datasetArn: string;

  public readonly userId: string;

  /** The user's metadata, as the JSON string the request carried. */
  public readonly properties: string | undefined;

  /** When simulated Personalize accepted the user, from the simulated clock. */
  public readonly recordedAt: Date;

  constructor(properties: SimPersonalizeRecordedUserProperties) {
    this.datasetArn = properties.datasetArn;
    this.userId = properties.userId;
    this.properties = properties.properties;
    this.recordedAt = properties.recordedAt;
  }
}
