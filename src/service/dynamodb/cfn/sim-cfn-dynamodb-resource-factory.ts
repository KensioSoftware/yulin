import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
  SimCloudFormationResourceDeleteContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCloudFormationResourceUpdateContext } from "../../cloudformation/resource/sim-cfn-resource.type.js";
import { simCfnResourceCallerOptions } from "../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";
import type { SimDynamoDb } from "../sim-dynamodb.js";
import { SimCfnDynamoDbGlobalTableCreator } from "./global-table/sim-cfn-dynamodb-global-table-creator.js";
import { SimCfnDynamoDbTableCreator } from "./table/sim-cfn-dynamodb-table-creator.js";
import { SimCfnDynamoDbResourceDeleter } from "./sim-cfn-dynamodb-resource-deleter.js";
import { SimCfnDynamoDbTableUpdateValidator } from "./table/sim-cfn-dynamodb-table-update-validator.js";

interface SimDynamoDbCfnResourceFactoryProperties {
  readonly dynamoDb: SimDynamoDb;
}

/**
 * CloudFormation Resource factory for simulated DynamoDB resources.
 */
export class SimDynamoDbCfnResourceFactory implements SimCfnServiceResourceFactory {
  private readonly tableCreator: SimCfnDynamoDbTableCreator;
  private readonly globalTableCreator: SimCfnDynamoDbGlobalTableCreator;
  private readonly deleter: SimCfnDynamoDbResourceDeleter;

  constructor(properties: SimDynamoDbCfnResourceFactoryProperties) {
    this.tableCreator = new SimCfnDynamoDbTableCreator({
      dynamoDb: properties.dynamoDb,
    });
    this.globalTableCreator = new SimCfnDynamoDbGlobalTableCreator({
      tableCreator: this.tableCreator,
    });
    this.deleter = new SimCfnDynamoDbResourceDeleter({
      dynamoDb: properties.dynamoDb,
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
    const options = simCfnResourceCallerOptions(context.caller);

    switch (resourceTypeName) {
      case "Table": {
        return await this.tableCreator.create(resource, properties, options);
      }
      case "GlobalTable": {
        return await this.globalTableCreator.create(
          resource,
          properties,
          options,
        );
      }
      default: {
        throw new Error(
          `Unsupported sim DynamoDB CloudFormation Resource ${resourceTypeName}`,
        );
      }
    }
  }

  /**
   * Delete a simulated DynamoDB resource created from a CloudFormation Resource.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceDeleteContext,
  ): Promise<void> {
    await this.deleter.delete(
      resourceTypeName,
      resource,
      simCfnResourceCallerOptions(context.caller),
    );
  }

  /**
   * Validate a DynamoDB Resource replacement before its table is deleted.
   */
  assertUpdateAllowed(
    resourceTypeName: string,
    current: SimCfnResource,
    updated: SimCfnResource,
    context: SimCloudFormationResourceUpdateContext,
  ): void {
    if (resourceTypeName !== "Table") {
      return;
    }

    new SimCfnDynamoDbTableUpdateValidator({
      currentResource: current,
      updatedResource: updated,
      currentProperties: context.currentResolvedProperties,
      updatedProperties: context.updatedResolvedProperties,
    }).assertAllowed();
  }
}
