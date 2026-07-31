import type { SimDynamoDbTable } from "../../../../dynamodb/table/sim-dynamodb-table.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimDynamoDbTableCfnProperties {
  readonly table: SimDynamoDbTable;
}

/**
 * CloudFormation-facing values for a simulated DynamoDB table.
 */
export class SimDynamoDbTableCfn implements SimCfnResourceValueAdapter {
  private readonly table: SimDynamoDbTable;

  constructor(properties: SimDynamoDbTableCfnProperties) {
    this.table = properties.table;
  }

  /**
   * AWS::DynamoDB::Table Ref returns the table name rather than its ARN, which
   * is what makes a Ref usable as a PutItem TableName. It is also what a
   * template hands a function through its environment.
   */
  refValue(): SimCfnTemplateValue {
    return this.table.tableName;
  }

  /**
   * AWS::DynamoDB::Table attributes.
   *
   * `Arn` is what an IAM policy names the table by. `StreamArn` is refused by
   * name: DynamoDB streams are not simulated, and an invented stream ARN would
   * read as a working stream to whatever the template handed it to.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    switch (attributeName) {
      case "Arn": {
        return this.table.arn;
      }
      case "StreamArn": {
        throw new Error(
          `Unsupported AWS::DynamoDB::Table attribute StreamArn: DynamoDB ` +
            `streams are not simulated, so there is no stream ARN to give ` +
            `rather than one nothing is publishing to`,
        );
      }
      default: {
        throw new Error(
          `Unsupported AWS::DynamoDB::Table attribute ${attributeName}`,
        );
      }
    }
  }
}
