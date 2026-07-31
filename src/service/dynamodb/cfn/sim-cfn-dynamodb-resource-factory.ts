import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimDynamoDb } from "../sim-dynamodb.js";
import { SimCfnDynamoDbTableCreator } from "./table/sim-cfn-dynamodb-table-creator.js";

interface SimDynamoDbCfnResourceFactoryProperties {
  readonly dynamoDb: SimDynamoDb;
}

/**
 * CloudFormation Resource factory for simulated DynamoDB resources.
 */
export class SimDynamoDbCfnResourceFactory implements SimCfnServiceResourceFactory {
  private readonly tableCreator: SimCfnDynamoDbTableCreator;

  constructor(properties: SimDynamoDbCfnResourceFactoryProperties) {
    this.tableCreator = new SimCfnDynamoDbTableCreator({
      dynamoDb: properties.dynamoDb,
    });
  }

  /**
   * Create a simulated DynamoDB resource from a CloudFormation Resource.
   *
   * The table is the only AWS::DynamoDB::* Resource type this simulation
   * models. A global table replicates across regions, which is not simulated,
   * so AWS::DynamoDB::GlobalTable is reported as unsupported and skipped rather
   * than quietly created as an ordinary table in one region.
   */
  async create(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<object | undefined> {
    switch (resourceTypeName) {
      case "Table": {
        return await this.tableCreator.create(
          resource,
          context.resolvedProperties ?? resource.properties,
        );
      }
      default: {
        throw new Error(
          `Unsupported sim DynamoDB CloudFormation Resource ${resourceTypeName}`,
        );
      }
    }
  }
}
