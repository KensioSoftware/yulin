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
        GlobalSecondaryIndexes: tableProperties.globalSecondaryIndexes(),
        LocalSecondaryIndexes: tableProperties.localSecondaryIndexes(),
        TableClass: tableProperties.tableClass(),
        DeletionProtectionEnabled: tableProperties.deletionProtectionEnabled(),
        StreamSpecification: tableProperties.streamSpecification(),
        Tags: tableProperties.tags(),
      },
    });

    await this.applyTimeToLive(name, tableProperties);

    const table = this.dynamoDb.findTable(name);
    assertDefined(
      table,
      `sim DynamoDB table ${name} after CloudFormation creation`,
    );

    return table;
  }

  /**
   * Switch the table's time to live on, when the template asked for it.
   *
   * CreateTable has no TimeToLiveSpecification of its own on real DynamoDB
   * either, so CloudFormation makes the table and then updates it, and this
   * does the same through the ordinary UpdateTimeToLive command.
   *
   * A template asking for time to live to be off describes the state a new
   * table is already in, and DynamoDB refuses an UpdateTimeToLive that asks for
   * the state it is already in, so there is nothing to send. The specification
   * is still read, so a template holding the wrong shape is still refused.
   */
  private async applyTimeToLive(
    name: string,
    tableProperties: SimCfnDynamoDbTableProperties,
  ): Promise<void> {
    const specification = tableProperties.timeToLiveSpecification();

    if (specification?.Enabled !== true) {
      return;
    }

    await this.dynamoDb.updateTimeToLive({
      input: { TableName: name, TimeToLiveSpecification: specification },
    });
  }
}
