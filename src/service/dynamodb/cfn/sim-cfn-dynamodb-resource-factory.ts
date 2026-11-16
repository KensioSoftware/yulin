import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
  SimCloudFormationResourceDeleteContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCloudFormationResourceInPlaceUpdateContext,
  SimCloudFormationResourceUpdateContext,
} from "../../cloudformation/resource/sim-cfn-resource.type.js";
import { simCfnResourceCallerOptions } from "../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";
import type { SimDynamoDb } from "../sim-dynamodb.js";
import { SimCfnDynamoDbGlobalTableCreator } from "./global-table/sim-cfn-dynamodb-global-table-creator.js";
import { SimCfnDynamoDbTableCreator } from "./table/sim-cfn-dynamodb-table-creator.js";
import { requireSimCfnDynamoDbCreator } from "./sim-cfn-dynamodb-resource-type.js";
import { SimCfnDynamoDbResourceDeleter } from "./sim-cfn-dynamodb-resource-deleter.js";
import { simCfnDynamoDbTableUpdatesInPlace } from "./table/sim-cfn-dynamodb-table-change.js";
import { SimCfnDynamoDbTableUpdater } from "./table/sim-cfn-dynamodb-table-updater.js";
import { SimCfnDynamoDbTableUpdateValidator } from "./table/sim-cfn-dynamodb-table-update-validator.js";

interface SimDynamoDbCfnResourceFactoryProperties {
  readonly dynamoDb: SimDynamoDb;
}

/**
 * CloudFormation Resource factory for simulated DynamoDB resources.
 */
export class SimDynamoDbCfnResourceFactory implements SimCfnServiceResourceFactory {
  private readonly creators: ReadonlyMap<
    string,
    SimCfnDynamoDbTableCreator | SimCfnDynamoDbGlobalTableCreator
  >;
  private readonly tableUpdater: SimCfnDynamoDbTableUpdater;
  private readonly deleter: SimCfnDynamoDbResourceDeleter;

  constructor(properties: SimDynamoDbCfnResourceFactoryProperties) {
    const tableCreator = new SimCfnDynamoDbTableCreator({
      dynamoDb: properties.dynamoDb,
    });
    this.creators = new Map<
      string,
      SimCfnDynamoDbTableCreator | SimCfnDynamoDbGlobalTableCreator
    >([
      ["Table", tableCreator],
      ["GlobalTable", new SimCfnDynamoDbGlobalTableCreator({ tableCreator })],
    ]);
    this.tableUpdater = new SimCfnDynamoDbTableUpdater({
      dynamoDb: properties.dynamoDb,
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
    return await requireSimCfnDynamoDbCreator(
      this.creators,
      resourceTypeName,
    ).create(
      resource,
      context.resolvedProperties ?? resource.properties,
      simCfnResourceCallerOptions(context.caller),
    );
  }

  /**
   * Whether a changed table can be applied to the deployed one.
   *
   * A table keeps its items across every change but its name, its key schema,
   * its local secondary indexes, its import source and the type of an
   * attribute it already defines. A global table is still replaced on any change.
   */
  updatesInPlace(
    resourceTypeName: string,
    current: SimCfnResource,
    updated: SimCfnResource,
  ): boolean {
    return simCfnDynamoDbTableUpdatesInPlace(
      resourceTypeName,
      current,
      updated,
    );
  }

  /**
   * Apply a changed AWS::DynamoDB::Table Resource to the deployed table.
   *
   * `updatesInPlace` claims a table and nothing else, so nothing else arrives.
   */
  async updateInPlace(
    _resourceTypeName: string,
    current: SimCfnResource,
    updated: SimCfnResource,
    context: SimCloudFormationResourceInPlaceUpdateContext,
  ): Promise<object | undefined> {
    return await this.tableUpdater.update(current, updated, context);
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
   * Validate a change to a DynamoDB Resource before its table is changed or
   * deleted.
   */
  assertUpdateAllowed(
    resourceTypeName: string,
    current: SimCfnResource,
    updated: SimCfnResource,
    context: SimCloudFormationResourceUpdateContext,
  ): void {
    new SimCfnDynamoDbTableUpdateValidator({
      resourceTypeName,
      currentResource: current,
      updatedResource: updated,
      currentProperties: context.currentResolvedProperties,
      updatedProperties: context.updatedResolvedProperties,
    }).assertAllowed();
  }
}
