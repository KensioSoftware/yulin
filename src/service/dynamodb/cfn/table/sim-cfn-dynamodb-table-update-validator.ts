import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type {
  SimDynamoDbGlobalSecondaryIndexUpdateInput,
  SimDynamoDbSecondaryIndexInput,
} from "../../command/table/table.types.js";
import { readSimDynamoDbIndexName } from "../../secondary-index/sim-dynamodb-index-name.js";
import { SimDynamoDbIndexUpdate } from "../../table/sim-dynamodb-index-update.js";
import { SimCfnDynamoDbTableProperties } from "./sim-cfn-dynamodb-table-properties.js";

interface SimCfnDynamoDbTableUpdateValidatorProperties {
  readonly currentResource: SimCfnResource;
  readonly updatedResource: SimCfnResource;
  readonly currentProperties: SimCfnTemplateValueRecord;
  readonly updatedProperties: SimCfnTemplateValueRecord;
}

/**
 * Validates constraints that apply when CloudFormation updates a table.
 */
export class SimCfnDynamoDbTableUpdateValidator {
  private readonly properties: SimCfnDynamoDbTableUpdateValidatorProperties;

  constructor(properties: SimCfnDynamoDbTableUpdateValidatorProperties) {
    this.properties = properties;
  }

  /**
   * Refuse a template diff that asks DynamoDB for too many index operations.
   *
   * https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-dynamodb-table.html
   */
  assertAllowed(): void {
    const { currentResource, updatedResource } = this.properties;
    const current = this.tableProperties(
      currentResource,
      this.properties.currentProperties,
    ).globalSecondaryIndexes();
    const updated = this.tableProperties(
      updatedResource,
      this.properties.updatedProperties,
    ).globalSecondaryIndexes();

    SimDynamoDbIndexUpdate.fromInput(this.indexUpdates(current, updated));
  }

  private tableProperties(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): SimCfnDynamoDbTableProperties {
    return new SimCfnDynamoDbTableProperties({ resource, properties });
  }

  private indexUpdates(
    current: readonly SimDynamoDbSecondaryIndexInput[],
    updated: readonly SimDynamoDbSecondaryIndexInput[],
  ): readonly SimDynamoDbGlobalSecondaryIndexUpdateInput[] {
    const currentNames = new Set(
      current.map((index) => readSimDynamoDbIndexName(index.IndexName)),
    );
    const updatedNames = new Set(
      updated.map((index) => readSimDynamoDbIndexName(index.IndexName)),
    );

    return [
      ...updated
        .filter(
          (index) =>
            !currentNames.has(readSimDynamoDbIndexName(index.IndexName)),
        )
        .map((index) => ({ Create: index })),
      ...current
        .filter(
          (index) =>
            !updatedNames.has(readSimDynamoDbIndexName(index.IndexName)),
        )
        .map((index) => ({ Delete: { IndexName: index.IndexName } })),
    ];
  }
}
