import type { SimPersonalizeDatasetType } from "./sim-personalize-dataset-type.js";
import type { SimPersonalizeResource } from "./sim-personalize-resource.js";

export interface SimPersonalizeDatasetProperties {
  readonly arn: string;
  readonly name: string;
  readonly status: string;
  readonly creationDateTime: Date;
  readonly datasetGroupArn: string;
  readonly datasetType: SimPersonalizeDatasetType;
  readonly schemaArn: string;
}

/**
 * A simulated Personalize dataset: an empty container of one type within a
 * dataset group.
 *
 * Real datasets are empty on creation too. Data arrives through a dataset
 * import job or through the events API, and simulated Personalize imports
 * nothing, so this stays empty for its whole life.
 */
export class SimPersonalizeDataset implements SimPersonalizeResource {
  public readonly arn: string;
  public readonly name: string;
  public readonly status: string;
  public readonly creationDateTime: Date;
  public readonly lastUpdatedDateTime: Date;
  public readonly datasetGroupArn: string;
  public readonly datasetType: SimPersonalizeDatasetType;
  public readonly schemaArn: string;

  constructor(properties: SimPersonalizeDatasetProperties) {
    this.arn = properties.arn;
    this.name = properties.name;
    this.status = properties.status;
    this.creationDateTime = properties.creationDateTime;
    this.lastUpdatedDateTime = properties.creationDateTime;
    this.datasetGroupArn = properties.datasetGroupArn;
    this.datasetType = properties.datasetType;
    this.schemaArn = properties.schemaArn;
  }
}
