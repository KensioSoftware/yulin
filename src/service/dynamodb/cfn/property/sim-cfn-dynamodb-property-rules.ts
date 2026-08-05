import type { SimCfnDynamoDbPropertyValues } from "./sim-cfn-dynamodb-property-values.js";
import type { SimCfnDynamoDbResourceScope } from "./sim-cfn-dynamodb-resource-scope.js";

interface SimCfnDynamoDbPropertyRulesProperties {
  readonly resourceTypeName: string;
  readonly scope: SimCfnDynamoDbResourceScope;

  /**
   * What the properties belong to, where they are not the Resource's own: a
   * `GlobalSecondaryIndex`, a `StreamSpecification`, a replica. A record names
   * it, so an unrecognised property says which shape it was not part of.
   */
  readonly kind?: string | undefined;
  readonly simulated: ReadonlySet<string>;
  readonly unsimulated?: ReadonlySet<string> | undefined;
}

/**
 * What simulated DynamoDB does with each property of one object in a table
 * template.
 *
 * A property this simulation cannot act on does not stop the table being
 * created. The table is created without it and the omission is recorded
 * against the Resource, where a test that expected the setting to do something
 * can find out that it never did. Anything that is not a property of that
 * object at all is recorded the same way, since a typo and a property AWS added
 * after this list was written look identical from here, and a table that
 * deploys is more useful than a stack that fails over either.
 *
 * The same rule applies at every level a template nests: the Resource's own
 * properties, the entries of an index list, a stream specification, a replica.
 * Each level differs only in which names belong to it, so each is a set of
 * names handed to this rather than a rule of its own.
 */
export class SimCfnDynamoDbPropertyRules {
  private readonly resourceTypeName: string;
  private readonly scope: SimCfnDynamoDbResourceScope;
  private readonly kind: string | undefined;
  private readonly simulated: ReadonlySet<string>;
  private readonly unsimulated: ReadonlySet<string>;

  constructor(properties: SimCfnDynamoDbPropertyRulesProperties) {
    this.resourceTypeName = properties.resourceTypeName;
    this.scope = properties.scope;
    this.kind = properties.kind;
    this.simulated = properties.simulated;
    this.unsimulated = properties.unsimulated ?? new Set<string>();
  }

  /**
   * Record everything about this object the table is created without.
   *
   * An object the template left out has nothing here to record.
   */
  apply(values: SimCfnDynamoDbPropertyValues | undefined): void {
    if (values === undefined) {
      return;
    }

    for (const name of values.names) {
      this.applyToProperty(values, name);
    }
  }

  /**
   * Apply the same rule to every entry of a list, such as the indexes or the
   * replicas a template declares.
   */
  applyToEach(entries: readonly SimCfnDynamoDbPropertyValues[]): void {
    for (const entry of entries) {
      this.apply(entry);
    }
  }

  private applyToProperty(
    values: SimCfnDynamoDbPropertyValues,
    name: string,
  ): void {
    if (this.simulated.has(name)) {
      return;
    }

    const path = values.pathTo(name);

    if (this.unsimulated.has(name)) {
      this.scope.ignorer.ignoreProperty(
        path,
        `${path} is a real ${this.resourceTypeName} property that simulated ` +
          `DynamoDB does not simulate, so the table is created without it`,
      );

      return;
    }

    this.scope.ignorer.ignoreProperty(
      path,
      `${path} is not ${this.description()} property simulated DynamoDB ` +
        `knows about, so the table is created without it`,
    );
  }

  /**
   * What an unrecognised property was not part of, as a record names it.
   */
  private description(): string {
    if (this.kind === undefined) {
      return `an ${this.resourceTypeName}`;
    }

    return `an ${this.resourceTypeName} ${this.kind}`;
  }
}
