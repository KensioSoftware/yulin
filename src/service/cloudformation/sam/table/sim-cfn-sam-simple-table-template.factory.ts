import { MappedFactory } from "@kensio/part-factory";

import type { CfnTemplateBodyRecord } from "../../template/sim-cfn-template.js";
import type { SimCfnTemplateValueRecord } from "../../template/value/sim-cfn-template-value.js";
import { samTransformName } from "../sim-cfn-sam-transform.js";
import { samSimpleTableType } from "./sim-cfn-sam-simple-table.js";

/**
 * What a test asks for when it wants a SAM template holding one simple table.
 */
export interface SimCfnSamSimpleTableTemplateInput {
  /**
   * What this test is about, added to the properties of a table that already
   * deploys.
   */
  readonly tableProperties: SimCfnTemplateValueRecord;
}

/**
 * The logical ID the table carries, and so the name the DynamoDB table is
 * expanded under.
 */
export const samSimpleTableTemplateLogicalId = "Rates";

/**
 * The name the table is deployed under, which a test reads it back by.
 */
export const samSimpleTableTemplateTableName = "rates";

/**
 * Builds a SAM template holding one AWS::Serverless::SimpleTable.
 *
 * ```typescript
 * const stack = await simAws.cloudFormation().deployTemplate({
 *   stackName: "rates-stack",
 *   template: simCfnSamSimpleTableTemplateFactory.make({
 *     tableProperties: { PrimaryKey: { Name: "currency", Type: "String" } },
 *   }),
 * });
 * ```
 *
 * The `Outputs` carry what `Ref` and `Fn::GetAtt` answer for the SAM logical
 * ID, since what those answer is half of what expanding a Resource has to get
 * right.
 */
export const simCfnSamSimpleTableTemplateFactory = new MappedFactory<
  SimCfnSamSimpleTableTemplateInput,
  CfnTemplateBodyRecord
>(
  () => ({ tableProperties: {} }),
  (input) => ({
    Transform: samTransformName,
    Resources: {
      [samSimpleTableTemplateLogicalId]: {
        Type: samSimpleTableType,
        Properties: {
          TableName: samSimpleTableTemplateTableName,
          ...input.tableProperties,
        },
      },
    },
    Outputs: {
      TableName: { Value: { Ref: samSimpleTableTemplateLogicalId } },
      TableArn: {
        Value: { "Fn::GetAtt": [samSimpleTableTemplateLogicalId, "Arn"] },
      },
    },
  }),
);
