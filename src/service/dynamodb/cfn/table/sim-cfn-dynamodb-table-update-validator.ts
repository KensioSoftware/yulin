import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimDynamoDbIndexUpdate } from "../../table/sim-dynamodb-index-update.js";
import { assertSimCfnDynamoDbNoIndexRedefined } from "./sim-cfn-dynamodb-table-index-change.js";
import { simCfnDynamoDbIndexUpdates } from "./sim-cfn-dynamodb-table-index-updates.js";
import { SimCfnDynamoDbTableProperties } from "./sim-cfn-dynamodb-table-properties.js";

interface SimCfnDynamoDbTableUpdateValidatorProperties {
  readonly resourceTypeName: string;
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
    const { resourceTypeName, currentResource, updatedResource } =
      this.properties;

    if (resourceTypeName !== "Table") {
      return;
    }

    const current = this.tableProperties(
      currentResource,
      this.properties.currentProperties,
    ).globalSecondaryIndexes();
    const updated = this.tableProperties(
      updatedResource,
      this.properties.updatedProperties,
    ).globalSecondaryIndexes();

    SimDynamoDbIndexUpdate.fromInput(
      simCfnDynamoDbIndexUpdates(current, updated),
    );
    assertSimCfnDynamoDbNoIndexRedefined(this.properties);
  }

  private tableProperties(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): SimCfnDynamoDbTableProperties {
    return new SimCfnDynamoDbTableProperties({ resource, properties });
  }
}
