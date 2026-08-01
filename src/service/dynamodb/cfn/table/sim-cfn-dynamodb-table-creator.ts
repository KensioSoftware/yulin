import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimDynamoDb } from "../../sim-dynamodb.js";
import type { SimDynamoDbTable } from "../../table/sim-dynamodb-table.js";
import { SimCfnDynamoDbTableProperties } from "./sim-cfn-dynamodb-table-properties.js";

interface SimCfnDynamoDbTableCreatorProperties {
  readonly dynamoDb: SimDynamoDb;
}

/**
 * Creates simulated tables from AWS::DynamoDB::Table Resources.
 *
 * The table is created through the ordinary CreateTable command rather than
 * constructed directly, so a table a template deployed is the same thing an SDK
 * caller would have got: the same name validation, the same key schema and
 * attribute definition rules, the same refusals for what this simulation does
 * not model.
 */
export class SimCfnDynamoDbTableCreator {
  private readonly dynamoDb: SimDynamoDb;

  constructor(properties: SimCfnDynamoDbTableCreatorProperties) {
    this.dynamoDb = properties.dynamoDb;
  }

  /**
   * Create a table from an AWS::DynamoDB::Table Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimDynamoDbTable> {
    const tableProperties = new SimCfnDynamoDbTableProperties({
      resource,
      properties,
    });
    tableProperties.assertSimulated();

    const name = tableProperties.name();

    await this.dynamoDb.createTable({
      input: {
        TableName: name,
        KeySchema: tableProperties.keySchema(),
        AttributeDefinitions: tableProperties.attributeDefinitions(),
        BillingMode: tableProperties.billingMode(),
        ProvisionedThroughput: tableProperties.provisionedThroughput(),
        TableClass: tableProperties.tableClass(),
        DeletionProtectionEnabled: tableProperties.deletionProtectionEnabled(),
        Tags: tableProperties.tags(),
      },
    });

    const table = this.dynamoDb.findTable(name);
    assertDefined(
      table,
      `sim DynamoDB table ${name} after CloudFormation creation`,
    );

    return table;
  }
}
