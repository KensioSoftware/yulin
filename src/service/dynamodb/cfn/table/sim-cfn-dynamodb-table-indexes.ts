import type {
  SimDynamoDbProjectionInput,
  SimDynamoDbSecondaryIndexInput,
} from "../../command/table/table.types.js";
import { readSimCfnDynamoDbKeySchema } from "./sim-cfn-dynamodb-table-key-schema.js";
import { readSimCfnDynamoDbThroughput } from "./sim-cfn-dynamodb-table-throughput.js";
import type { SimCfnDynamoDbPropertyValues } from "../property/sim-cfn-dynamodb-property-values.js";

/**
 * Read the `GlobalSecondaryIndexes` or `LocalSecondaryIndexes` an
 * AWS::DynamoDB::Table Resource declares.
 *
 * A template states both kinds the same way, so both are read here and handed
 * to CreateTable in the shape it takes. What an index is allowed to be is
 * decided there: the key schema rules, the projection rules, whether a local
 * index shares the table's partition key, and whether every key attribute has
 * an `AttributeDefinition`.
 *
 * One divergence is deliberate. AWS creates only one table with secondary
 * indexes at a time in an account and region, and refuses a second CreateTable
 * that overlaps it. Sim CloudFormation creates each dependency-ready batch of
 * Resources at once, so a template with two indexed tables and no `DependsOn`
 * between them deploys here. Serialising it would have meant holding up stack
 * timing over a rule that only bites on a template shape a test is unlikely to
 * be about, so the divergence is documented under Limitations instead.
 */
export function readSimCfnDynamoDbTableIndexes(
  values: SimCfnDynamoDbPropertyValues,
  propertyName: string,
): readonly SimDynamoDbSecondaryIndexInput[] {
  return values.list(propertyName).map((index) => readIndex(index));
}

/**
 * Read one entry of either index property.
 *
 * A local secondary index has no `ProvisionedThroughput` in a template at all,
 * so reading one that is not there leaves it out rather than inventing it.
 */
function readIndex(
  index: SimCfnDynamoDbPropertyValues,
): SimDynamoDbSecondaryIndexInput {
  return {
    IndexName: index.string("IndexName"),
    KeySchema: readSimCfnDynamoDbKeySchema(index),
    Projection: readProjection(index),
    ProvisionedThroughput: readSimCfnDynamoDbThroughput(index),
  };
}

/**
 * Read the `Projection` an index entry carries.
 *
 * An index with no `Projection` at all is left as it was declared, since
 * CreateTable is where an index says which attributes it carries and refuses
 * one that does not.
 */
function readProjection(
  index: SimCfnDynamoDbPropertyValues,
): SimDynamoDbProjectionInput | undefined {
  const projection = index.object("Projection");

  if (projection === undefined) {
    return undefined;
  }

  return {
    ProjectionType: projection.string("ProjectionType"),
    NonKeyAttributes: projection.strings("NonKeyAttributes"),
  };
}
