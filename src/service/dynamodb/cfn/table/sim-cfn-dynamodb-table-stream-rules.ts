import {
  dynamoDbTablePropertyError,
  dynamoDbTableUnsimulatedPropertyError,
} from "./sim-cfn-dynamodb-table-property-error.js";
import type { SimCfnDynamoDbTableValues } from "./sim-cfn-dynamodb-table-values.js";

/**
 * The StreamSpecification properties this simulation acts on.
 *
 * CloudFormation's StreamSpecification is not the SDK's: it has no
 * `StreamEnabled` field at all, so a template declaring the property at all is
 * asking for a stream, and the view type is the only thing left to say.
 */
const simulatedStreamPropertyNames: ReadonlySet<string> = new Set([
  "StreamViewType",
]);

/**
 * Real StreamSpecification properties this simulation does not model.
 *
 * The nested `ResourcePolicy` is a policy on the stream rather than on the
 * table, and is a different property from the table's own `ResourcePolicy`, so
 * it is named here rather than left to read as a property that does not exist.
 */
const unsimulatedStreamPropertyNames: ReadonlySet<string> = new Set([
  "ResourcePolicy",
]);

/**
 * Which properties of a table's StreamSpecification simulated DynamoDB can act
 * on.
 *
 * This is the table's own property rule applied a level down, as the index
 * rules are. A real property that is not simulated skips the table, since a
 * stream deployed without a policy the template asked for would be read by
 * whatever that policy was meant to keep out.
 */
export class SimCfnDynamoDbTableStreamRules {
  private readonly logicalId: string;

  constructor(logicalId: string) {
    this.logicalId = logicalId;
  }

  /**
   * Refuse everything about the table's StreamSpecification that is not
   * simulated.
   *
   * A table declaring no stream has nothing here to refuse.
   */
  assertSimulated(values: SimCfnDynamoDbTableValues): void {
    const specification = values.object("StreamSpecification");

    if (specification === undefined) {
      return;
    }

    for (const name of specification.names) {
      this.assertSimulatedProperty(specification, name);
    }
  }

  private assertSimulatedProperty(
    specification: SimCfnDynamoDbTableValues,
    name: string,
  ): void {
    if (simulatedStreamPropertyNames.has(name)) {
      return;
    }

    if (unsimulatedStreamPropertyNames.has(name)) {
      throw dynamoDbTableUnsimulatedPropertyError(
        this.logicalId,
        specification.pathTo(name),
      );
    }

    throw dynamoDbTablePropertyError(
      this.logicalId,
      `${specification.pathTo(name)} is not an AWS::DynamoDB::Table ` +
        `StreamSpecification property`,
    );
  }
}
