import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimGlueDatabase } from "../../database/sim-glue-database.js";
import type { SimGlue } from "../../sim-glue.js";
import { requireSimCfnGlueCatalogId } from "../sim-cfn-glue-catalog-id.js";
import { SimCfnGlueDatabaseProperties } from "./sim-cfn-glue-database-properties.js";

interface SimCfnGlueDatabaseCreatorProperties {
  readonly glue: SimGlue;
  readonly catalogId: string;
}

/**
 * Creates simulated databases from AWS::Glue::Database Resources.
 */
export class SimCfnGlueDatabaseCreator {
  readonly #glue: SimGlue;
  readonly #catalogId: string;

  constructor(properties: SimCfnGlueDatabaseCreatorProperties) {
    this.#glue = properties.glue;
    this.#catalogId = properties.catalogId;
  }

  /**
   * Create a database from an AWS::Glue::Database Resource.
   */
  create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): SimGlueDatabase {
    const databaseProperties = new SimCfnGlueDatabaseProperties({
      resource,
      properties,
    });

    requireSimCfnGlueCatalogId({
      resourceType: "AWS::Glue::Database",
      logicalId: resource.logicalId,
      declared: databaseProperties.catalogId(),
      simulated: this.#catalogId,
    });

    const databaseName = databaseProperties.databaseName();
    const databaseInput = databaseProperties.databaseInput();

    databaseProperties.recordIgnoredProperties();

    return this.#glue
      .catalogWriter()
      .createDatabase(databaseName, databaseInput);
  }

  /**
   * Delete a database created from an AWS::Glue::Database Resource.
   *
   * The tables in it go with it, as they do in an account.
   */
  delete(database: SimGlueDatabase): void {
    this.#glue.catalogWriter().deleteDatabase(database.name);
  }
}
