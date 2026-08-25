import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimGlueTable } from "../../table/sim-glue-table.js";
import type { SimGlue } from "../../sim-glue.js";
import { requireSimCfnGlueCatalogId } from "../sim-cfn-glue-catalog-id.js";
import { SimCfnGlueTableProperties } from "./sim-cfn-glue-table-properties.js";

interface SimCfnGlueTableCreatorProperties {
  readonly glue: SimGlue;
  readonly catalogId: string;
}

/**
 * Creates simulated tables from AWS::Glue::Table Resources.
 *
 * The database has to be there. A template declaring both usually leaves
 * CloudFormation to work the order out from the `Ref` the table's
 * `DatabaseName` carries, and one that names a database no stack creates fails
 * here the way `CreateTable` fails.
 */
export class SimCfnGlueTableCreator {
  readonly #glue: SimGlue;
  readonly #catalogId: string;

  constructor(properties: SimCfnGlueTableCreatorProperties) {
    this.#glue = properties.glue;
    this.#catalogId = properties.catalogId;
  }

  /**
   * Create a table from an AWS::Glue::Table Resource.
   */
  create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): SimGlueTable {
    const tableProperties = new SimCfnGlueTableProperties({
      resource,
      properties,
    });

    requireSimCfnGlueCatalogId({
      resourceType: "AWS::Glue::Table",
      logicalId: resource.logicalId,
      declared: tableProperties.catalogId(),
      simulated: this.#catalogId,
    });

    const databaseName = tableProperties.databaseName();
    const tableName = tableProperties.tableName();
    const tableInput = tableProperties.tableInput();

    tableProperties.recordIgnoredProperties();

    return this.#glue
      .catalogWriter()
      .createTable(databaseName, tableName, tableInput);
  }

  /**
   * Delete a table created from an AWS::Glue::Table Resource.
   */
  delete(table: SimGlueTable): void {
    this.#glue.catalogWriter().deleteTable(table.databaseName, table.name);
  }
}
