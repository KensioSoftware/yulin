import type { SimDynamoDbTableClass } from "../command/table/table.types.js";
import type { SimDynamoDbAttributeDefinitions } from "./sim-dynamodb-attribute-definitions.js";
import { SimDynamoDbItemKey } from "./sim-dynamodb-item-key.js";
import type { SimDynamoDbKeySchema } from "./sim-dynamodb-key-schema.js";
import type { SimDynamoDbTableBilling } from "./sim-dynamodb-table-billing.js";
import type { SimDynamoDbTableUpdate } from "./sim-dynamodb-table-update.js";

interface SimDynamoDbTableDefinitionProperties {
  readonly keySchema: SimDynamoDbKeySchema;
  readonly attributeDefinitions: SimDynamoDbAttributeDefinitions;
  readonly billing: SimDynamoDbTableBilling;
  readonly tableClass: SimDynamoDbTableClass | undefined;
}

/**
 * What a table is, as far as UpdateTable can change it.
 *
 * A table's key schema is fixed for its whole life, and everything here is not:
 * the attributes its keys are made of grow when an index is added, and how it is
 * billed and which class it is stored under can both be changed. Holding them
 * together is what lets an update replace them in one step, while everything
 * already holding the table goes on reading the table.
 */
export class SimDynamoDbTableDefinition {
  public readonly keySchema: SimDynamoDbKeySchema;

  #attributeDefinitions: SimDynamoDbAttributeDefinitions;
  #billing: SimDynamoDbTableBilling;
  #tableClass: SimDynamoDbTableClass | undefined;
  #itemKey: SimDynamoDbItemKey;

  constructor(properties: SimDynamoDbTableDefinitionProperties) {
    this.keySchema = properties.keySchema;
    this.#attributeDefinitions = properties.attributeDefinitions;
    this.#billing = properties.billing;
    this.#tableClass = properties.tableClass;
    this.#itemKey = new SimDynamoDbItemKey(
      properties.keySchema,
      properties.attributeDefinitions,
    );
  }

  /**
   * The attributes the table's keys are made of, its own and its indexes'.
   */
  get attributeDefinitions(): SimDynamoDbAttributeDefinitions {
    return this.#attributeDefinitions;
  }

  /**
   * How the table is billed, and what it is provisioned for.
   */
  get billing(): SimDynamoDbTableBilling {
    return this.#billing;
  }

  /**
   * The class the table is stored under, when it was given one.
   */
  get tableClass(): SimDynamoDbTableClass | undefined {
    return this.#tableClass;
  }

  /**
   * How the table reads the primary key of an item.
   */
  get itemKey(): SimDynamoDbItemKey {
    return this.#itemKey;
  }

  /**
   * Take the part of an UpdateTable that changes what the table is.
   *
   * The attribute definitions always come through, since an update that added
   * none gives back the set the table already had. The item key is rebuilt from
   * them, so a key attribute is still checked against the type the table
   * declares for it.
   */
  apply(update: SimDynamoDbTableUpdate): void {
    this.#attributeDefinitions = update.attributeDefinitions;
    this.#itemKey = new SimDynamoDbItemKey(
      this.keySchema,
      update.attributeDefinitions,
    );
    this.#billing = update.billing ?? this.#billing;
    this.#tableClass = update.tableClass ?? this.#tableClass;
  }
}
