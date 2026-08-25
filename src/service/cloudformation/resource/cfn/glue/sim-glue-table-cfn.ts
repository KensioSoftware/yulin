import type { SimGlueTable } from "../../../../glue/table/sim-glue-table.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

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
   * format for its value. Answering with a plausible one would put a string in
   * a template that a deploy to real AWS then disagrees with, so it is refused
   * until the real value has been observed.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    if (attributeName === "Id") {
      throw new Error(
        `AWS::Glue::Table Fn::GetAtt Id is not simulated. CloudFormation ` +
          `documents the attribute without documenting what its value ` +
          `contains, and a stand-in would differ from the value a real ` +
          `deploy resolves`,
      );
    }

    throw new Error(`Unsupported AWS::Glue::Table attribute ${attributeName}`);
  }
}
