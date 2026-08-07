import { assertDefined } from "../../../../../util/type-guard/defined.js";
import { dynamoDbGlobalTableResourceTypeName } from "../../../../dynamodb/cfn/sim-cfn-dynamodb-resource-type.js";
import type { SimDynamoDbTable } from "../../../../dynamodb/table/sim-dynamodb-table.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimDynamoDbTableCfnProperties {
  readonly table: SimDynamoDbTable;

  /**
   * Which of the two Resource types that make a table this is answering for,
   * since they document different attributes and a refusal names the type the
   * template asked through.
   */
  readonly resourceTypeName: string;
}

/**
 * CloudFormation-facing values for a simulated DynamoDB table.
 */
export class SimDynamoDbTableCfn implements SimCfnResourceValueAdapter {
  private readonly table: SimDynamoDbTable;
  private readonly resourceTypeName: string;

  constructor(properties: SimDynamoDbTableCfnProperties) {
    this.table = properties.table;
    this.resourceTypeName = properties.resourceTypeName;
  }

  /**
   * Both Resource types answer a Ref with the table name rather than its ARN,
   * which is what makes a Ref usable as a PutItem TableName. It is also what a
   * template hands a function through its environment.
   */
  refValue(): SimCfnTemplateValue {
    return this.table.tableName;
  }

  /**
   * The attributes a table Resource documents.
   *
   * `Arn` is what an IAM policy names the table by. `StreamArn` is the ARN of
   * the stream the table's `StreamSpecification` gave it. `TableId` is the
   * table's unique ID, which only AWS::DynamoDB::GlobalTable has an attribute
   * for.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    switch (attributeName) {
      case "Arn": {
        return this.table.arn;
      }
      case "StreamArn": {
        return this.streamArn();
      }
      case "TableId": {
        return this.tableId();
      }
      default: {
        throw this.unsupported(attributeName);
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

    assertDefined(
      arn,
      `Unsupported ${this.resourceTypeName} attribute StreamArn: table ` +
        `${this.table.tableName} has no StreamSpecification, so it has no ` +
        `stream and no stream ARN`,
    );

    return arn;
  }

  /**
   * The table's unique ID, which AWS::DynamoDB::Table has no attribute for at
   * all, so asking an ordinary table for one is refused as the unknown
   * attribute it is.
   */
  private tableId(): SimCfnTemplateValue {
    if (this.resourceTypeName !== dynamoDbGlobalTableResourceTypeName) {
      throw this.unsupported("TableId");
    }

    return this.table.tableId;
  }

  private unsupported(attributeName: string): Error {
    return new Error(
      `Unsupported ${this.resourceTypeName} attribute ${attributeName}`,
    );
  }
}
