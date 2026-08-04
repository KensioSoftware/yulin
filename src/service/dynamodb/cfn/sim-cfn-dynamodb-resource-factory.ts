import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimDynamoDb } from "../sim-dynamodb.js";
import { SimCfnDynamoDbGlobalTableCreator } from "./global-table/sim-cfn-dynamodb-global-table-creator.js";
import { SimCfnDynamoDbTableCreator } from "./table/sim-cfn-dynamodb-table-creator.js";

interface SimDynamoDbCfnResourceFactoryProperties {
  readonly dynamoDb: SimDynamoDb;
}

/**
 * CloudFormation Resource factory for simulated DynamoDB resources.
 */
export class SimDynamoDbCfnResourceFactory implements SimCfnServiceResourceFactory {
  private readonly tableCreator: SimCfnDynamoDbTableCreator;
  private readonly globalTableCreator: SimCfnDynamoDbGlobalTableCreator;

  constructor(properties: SimDynamoDbCfnResourceFactoryProperties) {
    this.tableCreator = new SimCfnDynamoDbTableCreator({
      dynamoDb: properties.dynamoDb,
    });
    this.globalTableCreator = new SimCfnDynamoDbGlobalTableCreator({
      tableCreator: this.tableCreator,
    });
  }

  /**
   * Create a simulated DynamoDB resource from a CloudFormation Resource.
   *
   * Both Resource types make a table. A global table naming one replica is an
   * ordinary table in that region, which is what CDK's `TableV2` synthesises
   * for every table it makes, so it is created rather than skipped. One naming
   * two or more regions genuinely replicates, which is not simulated, and is
   * skipped where it is read rather than here.
   */
  async create(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<object | undefined> {
    const properties = context.resolvedProperties ?? resource.properties;

    switch (resourceTypeName) {
      case "Table": {
        return await this.tableCreator.create(resource, properties);
      }
      case "GlobalTable": {
        return await this.globalTableCreator.create(resource, properties);
      }
      default: {
        throw new Error(
          `Unsupported sim DynamoDB CloudFormation Resource ${resourceTypeName}`,
        );
      }
    }
  }
}
