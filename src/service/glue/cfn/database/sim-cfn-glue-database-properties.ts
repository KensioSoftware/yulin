import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimGlueDatabaseInput } from "../../database/sim-glue-database-store.js";
import { glueCfnPropertyError } from "../sim-cfn-glue-property-error.js";
import { SimCfnGlueValues } from "../sim-cfn-glue-values.js";
import { SimCfnGlueDatabaseRules } from "./sim-cfn-glue-database-rules.js";
import { simCfnGlueGeneratedName } from "../sim-cfn-glue-generated-name.js";

const resourceType = "AWS::Glue::Database";

interface SimCfnGlueDatabasePropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads AWS::Glue::Database CloudFormation properties.
 */
export class SimCfnGlueDatabaseProperties {
  readonly #resource: SimCfnResource;
  readonly #properties: SimCfnTemplateValueRecord;
  readonly #values: SimCfnGlueValues;

  constructor(properties: SimCfnGlueDatabasePropertiesProperties) {
    this.#resource = properties.resource;
    this.#properties = properties.properties;
    this.#values = new SimCfnGlueValues((reason) =>
      glueCfnPropertyError(resourceType, properties.resource.logicalId, reason),
    );
  }

  /** The catalog id the template names, when it names one. */
  catalogId(): string | undefined {
    return this.#values.optionalString(
      this.#properties["CatalogId"],
      "CatalogId",
    );
  }

  /**
   * The database name.
   *
   * `DatabaseInput.Name` is what CDK writes. A template may also carry a
   * top-level `DatabaseName`, which is used when the input carries no name of
   * its own. An unnamed database is named after the stack and the logical ID,
   * lowercased, since Glue names are lowercase for Hive compatibility.
   */
  databaseName(): string {
    const values = this.#values;

    return (
      values.optionalString(this.#input()["Name"], "DatabaseInput.Name") ??
      values.optionalString(this.#properties["DatabaseName"], "DatabaseName") ??
      simCfnGlueGeneratedName(this.#resource)
    );
  }

  /** What the database is created with, beyond its name. */
  databaseInput(): SimGlueDatabaseInput {
    const input = this.#input();

    return {
      description: this.#values.optionalString(
        input["Description"],
        "DatabaseInput.Description",
      ),
      locationUri: this.#values.optionalString(
        input["LocationUri"],
        "DatabaseInput.LocationUri",
      ),
      parameters: this.#values.optionalParameters(
        input["Parameters"],
        "DatabaseInput.Parameters",
      ),
    };
  }

  /** Record the properties the database is created without acting on. */
  recordIgnoredProperties(): void {
    new SimCfnGlueDatabaseRules({
      properties: this.#properties,
      input: this.#input(),
      ignorer: this.#resource,
    }).apply();
  }

  #input(): SimCfnTemplateValueRecord {
    const input = this.#properties["DatabaseInput"];

    if (input === undefined) {
      throw this.#values.refuse("DatabaseInput is required");
    }

    return this.#values.record(input, "DatabaseInput");
  }
}
