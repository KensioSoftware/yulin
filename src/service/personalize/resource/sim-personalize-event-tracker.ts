import type { SimPersonalizeResource } from "./sim-personalize-resource.js";

export interface SimPersonalizeEventTrackerProperties {
  readonly arn: string;
  readonly name: string;
  readonly status: string;
  readonly creationDateTime: Date;
  readonly datasetGroupArn: string;
  readonly trackingId: string;
}

/**
 * A simulated Personalize event tracker: where `PutEvents` sends interactions.
 *
 * The tracking ID is the handle. A tracker is created against a dataset group
 * and reports an ID back, and every `PutEvents` names that ID in place of an
 * ARN. Real Personalize allows one tracker per dataset group.
 */
export class SimPersonalizeEventTracker implements SimPersonalizeResource {
  public readonly arn: string;
  public readonly name: string;
  public readonly status: string;
  public readonly creationDateTime: Date;
  public readonly lastUpdatedDateTime: Date;
  public readonly datasetGroupArn: string;
  public readonly trackingId: string;

  constructor(properties: SimPersonalizeEventTrackerProperties) {
    this.arn = properties.arn;
    this.name = properties.name;
    this.status = properties.status;
    this.creationDateTime = properties.creationDateTime;
    this.lastUpdatedDateTime = properties.creationDateTime;
    this.datasetGroupArn = properties.datasetGroupArn;
    this.trackingId = properties.trackingId;
  }
}
