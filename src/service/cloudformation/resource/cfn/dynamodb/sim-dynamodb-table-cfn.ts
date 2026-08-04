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
   * `Arn` is what an IAM policy names the table by. `StreamArn` is the ARN of
   * the stream the table's `StreamSpecification` gave it.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    switch (attributeName) {
      case "Arn": {
        return this.table.arn;
      }
      case "StreamArn": {
        return this.streamArn();
      }
      default: {
        throw new Error(
          `Unsupported AWS::DynamoDB::Table attribute ${attributeName}`,
        );
      }
    }
  }

  /**
   * The ARN of the table's stream, which it only has if it was asked for.
   *
   * A table with no `StreamSpecification` has no stream ARN to give, and an
   * invented one would read as a working stream to whatever the template handed
   * it to. Real CloudFormation refuses the same template while validating it,
   * where this refuses when the attribute is asked for.
   */
  private streamArn(): SimCfnTemplateValue {
    const arn = this.table.stream.latest?.arn;

    if (arn === undefined) {
      throw new Error(
        `Unsupported AWS::DynamoDB::Table attribute StreamArn: table ` +
          `${this.table.tableName} has no StreamSpecification, so it has no ` +
          `stream and no stream ARN`,
      );
    }

    return arn;
  }
}
