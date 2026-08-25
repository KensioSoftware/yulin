import type { SimCfnPropertyIgnorer } from "../../../cloudformation/resource/ignore/sim-cfn-ignored-property.type.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { unsimulatedDatabaseInputReasons } from "./sim-cfn-glue-database-unsimulated-properties.js";

const readNames = new Set(["CatalogId", "DatabaseInput", "DatabaseName"]);

const readInputNames = new Set([
  "Name",
  "Description",
  "LocationUri",
  "Parameters",
]);

interface SimCfnGlueDatabaseRulesProperties {
  readonly properties: SimCfnTemplateValueRecord;
  readonly input: SimCfnTemplateValueRecord;
  readonly ignorer: SimCfnPropertyIgnorer;
}

/**
 * What a database Resource is created without acting on.
 */
export class SimCfnGlueDatabaseRules {
  readonly #properties: SimCfnTemplateValueRecord;
  readonly #input: SimCfnTemplateValueRecord;
  readonly #ignorer: SimCfnPropertyIgnorer;

  constructor(properties: SimCfnGlueDatabaseRulesProperties) {
    this.#properties = properties.properties;
    this.#input = properties.input;
    this.#ignorer = properties.ignorer;
  }

  /** Record every property the database is created without. */
  apply(): void {
    for (const name of Object.keys(this.#properties)) {
      if (!readNames.has(name)) {
        this.#ignore(name, "AWS::Glue::Database");
      }
    }

    for (const name of Object.keys(this.#input)) {
      if (!readInputNames.has(name)) {
        this.#ignore(`DatabaseInput.${name}`, "DatabaseInput", name);
      }
    }
  }

  #ignore(path: string, owner: string, name = path): void {
    const reason = unsimulatedDatabaseInputReasons.get(name);

    this.#ignorer.ignoreProperty(
      path,
      reason === undefined
        ? `${path} is not a ${owner} property simulated Glue knows about, ` +
            `so the database is created without it`
        : `${path} is a real ${owner} property simulated Glue does not act ` +
            `on: ${reason}`,
    );
  }
}
