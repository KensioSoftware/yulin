import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimCfnDynamoDbPropertyValues } from "../property/sim-cfn-dynamodb-property-values.js";
import { dynamoDbGlobalTableResourceTypeName } from "../sim-cfn-dynamodb-resource-type.js";
import { simCfnDynamoDbGlobalTableCapacity } from "./sim-cfn-dynamodb-global-table-capacity.js";
import { simCfnDynamoDbGlobalTableIndexes } from "./sim-cfn-dynamodb-global-table-indexes.js";
import {
  simCfnDynamoDbGlobalTableEntry,
  simCfnDynamoDbGlobalTableProperty,
} from "./sim-cfn-dynamodb-global-table-property.js";
import { SimCfnDynamoDbGlobalTableReplicas } from "./sim-cfn-dynamodb-global-table-replicas.js";
import { assertSimCfnDynamoDbGlobalTableSimulated } from "./sim-cfn-dynamodb-global-table-simulated.js";

/**
 * The properties a global table states the same way an ordinary table does.
 */
const tableWordedPropertyNames: readonly string[] = [
  "AttributeDefinitions",
  "BillingMode",
  "KeySchema",
  "LocalSecondaryIndexes",
  "StreamSpecification",
  "TableName",
  "TimeToLiveSpecification",
];

/**
 * The properties a global table puts on its replica and an ordinary table puts
 * on itself.
 */
const replicaWordedPropertyNames: readonly string[] = [
  "DeletionProtectionEnabled",
  "TableClass",
  "Tags",
];

interface SimCfnDynamoDbGlobalTablePropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads an AWS::DynamoDB::GlobalTable Resource into the AWS::DynamoDB::Table
 * Resource it is.
 *
 * A global table with one replica is an ordinary table in that region, so it is
 * turned into one and deployed down the path an ordinary table already takes.
 * Nothing about what a key schema, a projection or a billing mode is allowed to
 * be is decided here: most properties are handed on in the shape the template
 * wrote them, and CreateTable is where they are checked.
 *
 * What is decided here is what a global table says differently. The replica
 * carries the settings an ordinary table carries itself, capacity is split
 * between the table's writes and the replica's reads, and there are properties
 * about replication that have nothing to be true of on one table in one region.
 */
export class SimCfnDynamoDbGlobalTableProperties {
  private readonly logicalId: string;
  private readonly values: SimCfnDynamoDbPropertyValues;
  private readonly replicas: SimCfnDynamoDbGlobalTableReplicas;

  constructor(properties: SimCfnDynamoDbGlobalTablePropertiesProperties) {
    this.logicalId = properties.resource.logicalId;
    this.values = new SimCfnDynamoDbPropertyValues({
      resourceTypeName: dynamoDbGlobalTableResourceTypeName,
      logicalId: this.logicalId,
      properties: properties.properties,
    });
    this.replicas = new SimCfnDynamoDbGlobalTableReplicas({
      logicalId: this.logicalId,
      regionName: properties.resource.accountRegionScope.regionName,
      values: this.values,
    });
  }

  /**
   * The AWS::DynamoDB::Table properties this global table is, refusing
   * everything about it that is not simulated on the way.
   *
   * The replica is settled first, since a table replicating across regions is
   * skipped whatever else it asks for.
   */
  tableProperties(): SimCfnTemplateValueRecord {
    const replica = this.replicas.single();

    assertSimCfnDynamoDbGlobalTableSimulated({
      logicalId: this.logicalId,
      values: this.values,
      replica,
    });

    const indexes = simCfnDynamoDbGlobalTableIndexes(this.values, replica);
    const capacity = simCfnDynamoDbGlobalTableCapacity({
      read: replica.object("ReadProvisionedThroughputSettings"),
      write: this.values.object("WriteProvisionedThroughputSettings"),
    });

    return Object.fromEntries([
      ...simCfnDynamoDbGlobalTableProperty(
        this.values,
        tableWordedPropertyNames,
      ),
      ...simCfnDynamoDbGlobalTableProperty(replica, replicaWordedPropertyNames),
      ...simCfnDynamoDbGlobalTableEntry("GlobalSecondaryIndexes", indexes),
      ...simCfnDynamoDbGlobalTableEntry("ProvisionedThroughput", capacity),
    ]);
  }
}
