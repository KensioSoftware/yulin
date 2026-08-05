import { SimCfnGeneratedResourceName } from "../../../cloudformation/resource/name/sim-cfn-generated-resource-name.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type {
  SimDynamoDbAttributeDefinitionInput,
  SimDynamoDbKeySchemaElementInput,
  SimDynamoDbProvisionedThroughput,
  SimDynamoDbSecondaryIndexInput,
  SimDynamoDbTagInput,
} from "../../command/table/table.types.js";
import type { SimDynamoDbTimeToLiveSpecificationInput } from "../../command/time-to-live/time-to-live.types.js";
import type { SimDynamoDbStreamSpecification } from "../../stream/sim-dynamodb-stream.types.js";
import { dynamoDbTableResourceTypeName } from "../sim-cfn-dynamodb-resource-type.js";
import { readSimCfnDynamoDbTableIndexes } from "./sim-cfn-dynamodb-table-indexes.js";
import { readSimCfnDynamoDbKeySchema } from "./sim-cfn-dynamodb-table-key-schema.js";
import { SimCfnDynamoDbTablePropertyRules } from "./sim-cfn-dynamodb-table-property-rules.js";
import { readSimCfnDynamoDbTableStream } from "./sim-cfn-dynamodb-table-stream.js";
import { readSimCfnDynamoDbThroughput } from "./sim-cfn-dynamodb-table-throughput.js";
import { readSimCfnDynamoDbTableTimeToLive } from "./sim-cfn-dynamodb-table-time-to-live.js";
import { SimCfnDynamoDbPropertyValues } from "../property/sim-cfn-dynamodb-property-values.js";

/**
 * A table name is at most 255 characters, so a generated one is trimmed to fit.
 */
const maximumNameLength = 255;

interface SimCfnDynamoDbTablePropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads AWS::DynamoDB::Table CloudFormation properties into the shape
 * CreateTable takes.
 *
 * Nothing here decides what a key schema, a billing mode or a table class is
 * allowed to be. Each value is passed through to CreateTable in the shape it
 * takes, so the table a template deployed had to pass the same validation an
 * SDK caller's table does.
 */
export class SimCfnDynamoDbTableProperties {
  private readonly resource: SimCfnResource;
  private readonly rules: SimCfnDynamoDbTablePropertyRules;
  private readonly values: SimCfnDynamoDbPropertyValues;

  constructor(properties: SimCfnDynamoDbTablePropertiesProperties) {
    this.resource = properties.resource;
    this.values = new SimCfnDynamoDbPropertyValues({
      resourceTypeName: dynamoDbTableResourceTypeName,
      logicalId: properties.resource.logicalId,
      properties: properties.properties,
    });
    this.rules = new SimCfnDynamoDbTablePropertyRules({
      scope: {
        logicalId: properties.resource.logicalId,
        ignorer: properties.resource,
      },
      values: this.values,
    });
  }

  /**
   * Record everything about this Resource the table is created without, before
   * anything is read off it.
   */
  applyPropertyRules(): void {
    this.rules.apply();
  }

  /**
   * The table name.
   *
   * An unnamed table is named after the stack and the logical ID, as real
   * CloudFormation names one, so one template deployed under two stack names
   * makes two tables.
   */
  name(): string {
    return this.values.string("TableName") ?? this.generatedName();
  }

  /**
   * The table's primary key elements, in the order the template lists them.
   */
  keySchema(): readonly SimDynamoDbKeySchemaElementInput[] {
    return readSimCfnDynamoDbKeySchema(this.values);
  }

  /**
   * The definitions of the attributes the table's keys are made of.
   */
  attributeDefinitions(): readonly SimDynamoDbAttributeDefinitionInput[] {
    return this.values.list("AttributeDefinitions").map((definition) => {
      return {
        AttributeName: definition.string("AttributeName"),
        AttributeType: definition.string("AttributeType"),
      };
    });
  }

  /**
   * The billing mode, which CreateTable checks and defaults.
   */
  billingMode(): string | undefined {
    return this.values.string("BillingMode");
  }

  /**
   * The capacity a provisioned table is created with.
   */
  provisionedThroughput(): SimDynamoDbProvisionedThroughput | undefined {
    return readSimCfnDynamoDbThroughput(this.values);
  }

  /**
   * The global secondary indexes the template declares on the table.
   */
  globalSecondaryIndexes(): readonly SimDynamoDbSecondaryIndexInput[] {
    return readSimCfnDynamoDbTableIndexes(
      this.values,
      "GlobalSecondaryIndexes",
    );
  }

  /**
   * The local secondary indexes the template declares on the table.
   */
  localSecondaryIndexes(): readonly SimDynamoDbSecondaryIndexInput[] {
    return readSimCfnDynamoDbTableIndexes(this.values, "LocalSecondaryIndexes");
  }

  /**
   * The table class, which CreateTable checks.
   */
  tableClass(): string | undefined {
    return this.values.string("TableClass");
  }

  /**
   * The tags the template puts on the table.
   *
   * A CDK app calling `Tags.of(stack).add(...)` puts these on every taggable
   * Resource in the template, so a tagged table is the ordinary case rather
   * than an unusual one.
   */
  tags(): readonly SimDynamoDbTagInput[] {
    return this.values.list("Tags").map((tag) => {
      return { Key: tag.string("Key"), Value: tag.string("Value") };
    });
  }

  /**
   * Whether the table is protected from deletion.
   */
  deletionProtectionEnabled(): boolean | undefined {
    return this.values.boolean("DeletionProtectionEnabled");
  }

  /**
   * The stream the template asks for, when it asks for one.
   */
  streamSpecification(): SimDynamoDbStreamSpecification | undefined {
    return readSimCfnDynamoDbTableStream(this.values);
  }

  /**
   * The time to live the template asks for, when it asks for one.
   */
  timeToLiveSpecification():
    SimDynamoDbTimeToLiveSpecificationInput | undefined {
    return readSimCfnDynamoDbTableTimeToLive(this.values);
  }

  /**
   * The name for a table the template did not name.
   */
  private generatedName(): string {
    return new SimCfnGeneratedResourceName({
      stackName: this.resource.stackName,
      logicalId: this.resource.logicalId,
      maximumLength: maximumNameLength,
    }).value;
  }
}
