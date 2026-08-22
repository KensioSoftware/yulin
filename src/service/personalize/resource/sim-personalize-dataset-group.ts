import type { SimPersonalizeDomain } from "./sim-personalize-domain.js";
import type { SimPersonalizeResource } from "./sim-personalize-resource.js";

export interface SimPersonalizeDatasetGroupProperties {
  readonly arn: string;
  readonly name: string;
  readonly status: string;
  readonly creationDateTime: Date;
  readonly domain?: SimPersonalizeDomain | undefined;
  readonly kmsKeyArn?: string | undefined;
  readonly roleArn?: string | undefined;
}

/**
 * A simulated Personalize dataset group: the container every other resource
 * hangs off.
 *
 * A group carrying a domain is a Domain dataset group and one without is a
 * custom one. Simulated Personalize records the domain and otherwise treats
 * the two alike, because the difference shows up in recommenders rather than
 * here.
 */
export class SimPersonalizeDatasetGroup implements SimPersonalizeResource {
  public readonly arn: string;
  public readonly name: string;
  public readonly status: string;
  public readonly creationDateTime: Date;
  public readonly lastUpdatedDateTime: Date;
  public readonly domain: SimPersonalizeDomain | undefined;
  public readonly kmsKeyArn: string | undefined;
  public readonly roleArn: string | undefined;

  constructor(properties: SimPersonalizeDatasetGroupProperties) {
    this.arn = properties.arn;
    this.name = properties.name;
    this.status = properties.status;
    this.creationDateTime = properties.creationDateTime;
    this.lastUpdatedDateTime = properties.creationDateTime;
    this.domain = properties.domain;
    this.kmsKeyArn = properties.kmsKeyArn;
    this.roleArn = properties.roleArn;
  }
}
