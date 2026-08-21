import type { SimPersonalizeResource } from "./sim-personalize-resource.js";

export interface SimPersonalizeSolutionVersionProperties {
  readonly arn: string;
  readonly name: string;
  readonly status: string;
  readonly creationDateTime: Date;
  readonly solutionArn: string;
  readonly trainingMode: string;
}

/**
 * A simulated Personalize solution version: what a campaign deploys.
 *
 * Real Personalize spends tens of minutes fitting a model here and reports
 * `CREATE PENDING` while it does. This one is `ACTIVE` as soon as it is
 * created, so a test reaches a campaign without advancing a clock or polling a
 * status.
 */
export class SimPersonalizeSolutionVersion implements SimPersonalizeResource {
  public readonly arn: string;
  public readonly name: string;
  public readonly status: string;
  public readonly creationDateTime: Date;
  public readonly lastUpdatedDateTime: Date;
  public readonly solutionArn: string;
  public readonly trainingMode: string;

  constructor(properties: SimPersonalizeSolutionVersionProperties) {
    this.arn = properties.arn;
    this.name = properties.name;
    this.status = properties.status;
    this.creationDateTime = properties.creationDateTime;
    this.lastUpdatedDateTime = properties.creationDateTime;
    this.solutionArn = properties.solutionArn;
    this.trainingMode = properties.trainingMode;
  }
}
