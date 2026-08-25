import type { SimGlueDatabase } from "../../../../glue/database/sim-glue-database.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimGlueDatabaseCfnProperties {
  readonly database: SimGlueDatabase;
}

/**
 * CloudFormation-facing values for a simulated Glue database.
 */
export class SimGlueDatabaseCfn implements SimCfnResourceValueAdapter {
  readonly #database: SimGlueDatabase;

  constructor(properties: SimGlueDatabaseCfnProperties) {
    this.#database = properties.database;
  }

  /**
   * AWS::Glue::Database Ref returns the database name.
   */
  refValue(): SimCfnTemplateValue {
    return this.#database.name;
  }

  /**
   * AWS::Glue::Database has no Fn::GetAtt attributes.
   *
   * The CloudFormation reference lists none, and `CfnDatabase` in the CDK
   * exposes none either, so an attribute asked for here is a mistake in the
   * template rather than a gap in the simulation.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    throw new Error(
      `AWS::Glue::Database has no attributes, and ${attributeName} was ` +
        `asked for`,
    );
  }
}
