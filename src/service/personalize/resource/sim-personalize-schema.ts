import type { SimPersonalizeResource } from "./sim-personalize-resource.js";

export interface SimPersonalizeSchemaProperties {
  readonly arn: string;
  readonly name: string;
  readonly status: string;
  readonly creationDateTime: Date;
  readonly schema: string;
  readonly domain?: string | undefined;
}

/**
 * A simulated Personalize schema: the Avro document describing a dataset's
 * fields.
 *
 * The document is held as the string the request gave and is never parsed.
 * Nothing here reads a dataset, so the fields it declares have nothing to
 * describe.
 */
export class SimPersonalizeSchema implements SimPersonalizeResource {
  public readonly arn: string;
  public readonly name: string;
  public readonly status: string;
  public readonly creationDateTime: Date;
  public readonly lastUpdatedDateTime: Date;
  public readonly schema: string;
  public readonly domain: string | undefined;

  constructor(properties: SimPersonalizeSchemaProperties) {
    this.arn = properties.arn;
    this.name = properties.name;
    this.status = properties.status;
    this.creationDateTime = properties.creationDateTime;
    this.lastUpdatedDateTime = properties.creationDateTime;
    this.schema = properties.schema;
    this.domain = properties.domain;
  }
}
