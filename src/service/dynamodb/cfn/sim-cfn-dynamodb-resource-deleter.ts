import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimDynamoDb } from "../sim-dynamodb.js";
import type { SimDynamoDbTable } from "../table/sim-dynamodb-table.js";
import { assertDefined } from "../../../util/type-guard/defined.js";

interface SimCfnDynamoDbResourceDeleterProperties {
  readonly dynamoDb: SimDynamoDb;
}

/**
 * Deletes the simulated DynamoDB tables a CloudFormation Stack created.
 *
 * Both Resource types made a table, so both are deleted as one. A table with
 * deletion protection turned on is refused by the ordinary command, as it is on
 * AWS, where it is the whole point of the setting.
 */
export class SimCfnDynamoDbResourceDeleter {
  private readonly dynamoDb: SimDynamoDb;

  constructor(properties: SimCfnDynamoDbResourceDeleterProperties) {
    this.dynamoDb = properties.dynamoDb;
  }

  /**
   * Delete a simulated DynamoDB resource created from a CloudFormation
   * Resource.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
  ): Promise<void> {
    if (resourceTypeName !== "Table" && resourceTypeName !== "GlobalTable") {
      throw new Error(
        `Unsupported sim DynamoDB CloudFormation Resource ${resourceTypeName} deletion`,
      );
    }

    const table = resource.simResource as SimDynamoDbTable | undefined;
    assertDefined(
      table,
      `sim DynamoDB table for CloudFormation Resource ${resource.logicalId}`,
    );

    await this.dynamoDb.deleteTable({
      input: { TableName: table.tableName },
    });
  }
}
