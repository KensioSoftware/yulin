import {
  dynamoDbPropertyError,
  dynamoDbUnsimulatedPropertyError,
} from "./sim-cfn-dynamodb-property-error.js";
import type { SimCfnDynamoDbPropertyValues } from "./sim-cfn-dynamodb-property-values.js";

interface SimCfnDynamoDbPropertyRulesProperties {
  readonly resourceTypeName: string;
  readonly logicalId: string;

  /**
   * What the properties belong to, where they are not the Resource's own: a
   * `GlobalSecondaryIndex`, a `StreamSpecification`, a replica. A refusal names
   * it, so an unrecognised property says which shape it was not part of.
   */
  readonly kind?: string | undefined;
  readonly simulated: ReadonlySet<string>;
  readonly unsimulated?: ReadonlySet<string> | undefined;
}

/**
 * Which properties of one object in a DynamoDB Resource template simulated
 * DynamoDB can act on.
 *
 * A real property that is not simulated skips the Resource, with a reason
 * naming it, so the rest of the stack still deploys and the report says what
 * was left out. Anything that is not a property of that object at all fails the
 * Resource instead, because that is a template real CloudFormation would refuse
 * too.
 *
 * The same rule applies at every level a template nests: the Resource's own
 * properties, the entries of an index list, a stream specification, a replica.
 * Each level differs only in which names belong to it, so each is a set of
 * names handed to this rather than a rule of its own.
 */
export class SimCfnDynamoDbPropertyRules {
  private readonly resourceTypeName: string;
  private readonly logicalId: string;
  private readonly kind: string | undefined;
  private readonly simulated: ReadonlySet<string>;
  private readonly unsimulated: ReadonlySet<string>;

  constructor(properties: SimCfnDynamoDbPropertyRulesProperties) {
    this.resourceTypeName = properties.resourceTypeName;
    this.logicalId = properties.logicalId;
    this.kind = properties.kind;
    this.simulated = properties.simulated;
    this.unsimulated = properties.unsimulated ?? new Set<string>();
  }

  /**
   * Refuse everything about this object that is not simulated.
   *
   * An object the template left out has nothing here to refuse.
   */
  assertSimulated(values: SimCfnDynamoDbPropertyValues | undefined): void {
    if (values === undefined) {
      return;
    }

    for (const name of values.names) {
      this.assertSimulatedProperty(values, name);
    }
  }

  /**
   * Apply the same rule to every entry of a list, such as the indexes or the
   * replicas a template declares.
   */
  assertEachSimulated(entries: readonly SimCfnDynamoDbPropertyValues[]): void {
    for (const entry of entries) {
      this.assertSimulated(entry);
    }
  }

  private assertSimulatedProperty(
    values: SimCfnDynamoDbPropertyValues,
    name: string,
  ): void {
    if (this.simulated.has(name)) {
      return;
    }

    if (this.unsimulated.has(name)) {
      throw dynamoDbUnsimulatedPropertyError(
        this.resourceTypeName,
        this.logicalId,
        values.pathTo(name),
      );
    }

    throw dynamoDbPropertyError(
      this.resourceTypeName,
      this.logicalId,
      `${values.pathTo(name)} is not ${this.description()} property`,
    );
  }

  /**
   * What an unrecognised property was not part of, as a refusal names it.
   */
  private description(): string {
    if (this.kind === undefined) {
      return `an ${this.resourceTypeName}`;
    }

    return `an ${this.resourceTypeName} ${this.kind}`;
  }
}
