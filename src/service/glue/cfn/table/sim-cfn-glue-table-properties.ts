import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimGlueTableInput } from "../../table/sim-glue-table-schema.js";
import { glueCfnPropertyError } from "../sim-cfn-glue-property-error.js";
import { SimCfnGlueRecord } from "../sim-cfn-glue-record.js";
import { SimCfnGlueValues } from "../sim-cfn-glue-values.js";
import { SimCfnGlueTableInputReader } from "./sim-cfn-glue-table-input.js";
import { simCfnGlueTableIgnored } from "./sim-cfn-glue-table-rules.js";
import { simCfnGlueGeneratedName } from "../sim-cfn-glue-generated-name.js";

const resourceType = "AWS::Glue::Table";

interface SimCfnGlueTablePropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads AWS::Glue::Table CloudFormation properties.
 */
export class SimCfnGlueTableProperties {
  readonly #resource: SimCfnResource;
  readonly #fields: SimCfnGlueRecord;
  readonly #reader: SimCfnGlueTableInputReader;

  constructor(properties: SimCfnGlueTablePropertiesProperties) {
    const values = new SimCfnGlueValues((reason) =>
      glueCfnPropertyError(resourceType, properties.resource.logicalId, reason),
    );

    this.#resource = properties.resource;
    this.#fields = new SimCfnGlueRecord(
      values,
      properties.properties,
      resourceType,
    );
    this.#reader = new SimCfnGlueTableInputReader(properties.resource);
  }

  /** The catalog id the template names, when it names one. */
  catalogId(): string | undefined {
    return this.#fields.string("CatalogId");
  }

  /** The database the table belongs to, which real Glue requires. */
  databaseName(): string {
    return this.#fields.values.string(
      this.#fields.required("DatabaseName"),
      "DatabaseName",
    );
  }

  /**
   * The table name.
   *
   * An unnamed table is named after the stack and the logical ID, lowercased,
   * since Glue names are lowercase for Hive compatibility.
   */
  tableName(): string {
    return (
      this.#input().string("Name") ?? simCfnGlueGeneratedName(this.#resource)
    );
  }

  /** What the table is created with, beyond its name and its database. */
  tableInput(): SimGlueTableInput {
    return this.#reader.read(this.#input());
  }

  /** Record the properties the table is created without acting on. */
  recordIgnoredProperties(): void {
    simCfnGlueTableIgnored({
      resource: this.#resource,
      names: this.#fields.keys(),
      inputNames: this.#input().keys(),
    });
  }

  #input(): SimCfnGlueRecord {
    return this.#fields.nested(
      this.#fields.required("TableInput"),
      "TableInput",
    );
  }
}
