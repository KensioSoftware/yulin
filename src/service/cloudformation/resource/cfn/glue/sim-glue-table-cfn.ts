import type { SimGlueTable } from "../../../../glue/table/sim-glue-table.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";
import { simGlueTableCfnId } from "./sim-glue-table-cfn-id.js";

interface SimGlueTableCfnProperties {
  readonly table: SimGlueTable;
}

/**
 * CloudFormation-facing values for a simulated Glue table.
 */
export class SimGlueTableCfn implements SimCfnResourceValueAdapter {
  readonly #table: SimGlueTable;

  constructor(properties: SimGlueTableCfnProperties) {
    this.#table = properties.table;
  }

  /**
   * AWS::Glue::Table Ref returns the table name.
   */
  refValue(): SimCfnTemplateValue {
    return this.#table.name;
  }

  /**
   * AWS::Glue::Table attributes.
   *
   * `Id` is the one attribute CloudFormation documents, and it documents no
   * format for its value. `simGlueTableCfnId` says what this answers with and
   * why that value is a guess.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    if (attributeName === "Id") {
      return simGlueTableCfnId(this.#table);
    }

    throw new Error(`Unsupported AWS::Glue::Table attribute ${attributeName}`);
  }
}
