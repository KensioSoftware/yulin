import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimDynamoDbTable } from "../../table/sim-dynamodb-table.js";
import type { SimCfnDynamoDbTableCreator } from "../table/sim-cfn-dynamodb-table-creator.js";
import { SimCfnDynamoDbGlobalTableProperties } from "./sim-cfn-dynamodb-global-table-properties.js";

interface SimCfnDynamoDbGlobalTableCreatorProperties {
  readonly tableCreator: SimCfnDynamoDbTableCreator;
}

/**
 * Creates simulated tables from AWS::DynamoDB::GlobalTable Resources.
 *
 * A global table naming one replica is turned into the AWS::DynamoDB::Table it
 * is and created down the path an ordinary table already takes, so the table a
 * `TableV2` stack deployed is the same thing a `Table` stack would have got:
 * the same name generation, the same CreateTable rules, the same refusals for
 * what this simulation does not model.
 */
export class SimCfnDynamoDbGlobalTableCreator {
  private readonly tableCreator: SimCfnDynamoDbTableCreator;

  constructor(properties: SimCfnDynamoDbGlobalTableCreatorProperties) {
    this.tableCreator = properties.tableCreator;
  }

  /**
   * Create a table from an AWS::DynamoDB::GlobalTable Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimDynamoDbTable> {
    const globalTable = new SimCfnDynamoDbGlobalTableProperties({
      resource,
      properties,
    });

    return await this.tableCreator.create(
      resource,
      globalTable.tableProperties(),
    );
  }
}
