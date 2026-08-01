import type {
  SimDynamoDbProjection,
  SimDynamoDbProjectionInput,
  SimDynamoDbProjectionType,
} from "../command/table/table.types.js";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";

/**
 * The three things an index projection can be.
 */
const projectionTypes = ["ALL", "KEYS_ONLY", "INCLUDE"] as const;

/**
 * The most `NonKeyAttributes` one index adds to its keys.
 */
const maxNonKeyAttributes = 20;

/**
 * Read the projection type an index declares.
 */
function readProjectionType(
  type: string | undefined,
  indexName: string,
): SimDynamoDbProjectionType {
  if (type === undefined) {
    throw new SimDynamoDbValidationException(
      `The Projection of index ${indexName} has no ProjectionType. It is one ` +
        `of ${projectionTypes.join(", ")}.`,
    );
  }

  const found = projectionTypes.find((candidate) => candidate === type);

  if (found === undefined) {
    throw new SimDynamoDbValidationException(
      `ProjectionType '${type}' of index ${indexName} is invalid. It is one ` +
        `of ${projectionTypes.join(", ")}.`,
    );
  }

  return found;
}

/**
 * Read the attributes an INCLUDE projection adds to the index keys.
 *
 * The two halves have to agree in both directions. INCLUDE with nothing to
 * include is KEYS_ONLY written the long way round, and attributes named under
 * any other projection type have nothing to be added to.
 */
function readNonKeyAttributes(
  attributeNames: readonly string[] | undefined,
  type: SimDynamoDbProjectionType,
  indexName: string,
): readonly string[] {
  if (type !== "INCLUDE") {
    if (attributeNames !== undefined) {
      throw new SimDynamoDbValidationException(
        `The Projection of index ${indexName} names NonKeyAttributes with a ` +
          `ProjectionType of ${type}. INCLUDE is the projection type that ` +
          `names the attributes it adds.`,
      );
    }

    return [];
  }

  if (attributeNames === undefined || attributeNames.length === 0) {
    throw new SimDynamoDbValidationException(
      `The Projection of index ${indexName} is INCLUDE and names no ` +
        `NonKeyAttributes, so it adds nothing to KEYS_ONLY`,
    );
  }

  if (attributeNames.length > maxNonKeyAttributes) {
    throw new SimDynamoDbValidationException(
      `The Projection of index ${indexName} names ` +
        `${attributeNames.length.toString()} NonKeyAttributes, and an index ` +
        `projects at most ${maxNonKeyAttributes.toString()}`,
    );
  }

  return attributeNames;
}

/**
 * Which attributes one secondary index carries.
 *
 * An index is a copy of the table holding the attributes it projects, so what
 * it projects is what a read of it can answer with. KEYS_ONLY carries the index
 * keys and the table keys, INCLUDE adds named attributes to those, and ALL
 * carries the whole item.
 */
export class SimDynamoDbIndexProjection {
  public readonly type: SimDynamoDbProjectionType;

  private readonly nonKeyAttributes: readonly string[];

  private constructor(
    type: SimDynamoDbProjectionType,
    nonKeyAttributes: readonly string[],
  ) {
    this.type = type;
    this.nonKeyAttributes = nonKeyAttributes;
  }

  /**
   * Read the Projection a secondary index has to carry.
   */
  static fromInput(
    input: SimDynamoDbProjectionInput | undefined,
    indexName: string,
  ): SimDynamoDbIndexProjection {
    if (input === undefined) {
      throw new SimDynamoDbValidationException(
        `Index ${indexName} has no Projection, and an index says which ` +
          `attributes it carries`,
      );
    }

    const type = readProjectionType(input.ProjectionType, indexName);

    return new this(
      type,
      readNonKeyAttributes(input.NonKeyAttributes, type, indexName),
    );
  }

  /**
   * How an index reports its projection.
   *
   * `NonKeyAttributes` is left out altogether unless the projection is INCLUDE,
   * since the other two types have none to report.
   */
  toDescription(): SimDynamoDbProjection {
    if (this.type !== "INCLUDE") {
      return { ProjectionType: this.type };
    }

    return {
      ProjectionType: this.type,
      NonKeyAttributes: this.nonKeyAttributes,
    };
  }
}
