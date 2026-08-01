import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";

/**
 * Which KeySchema of a request a refusal is about.
 *
 * A CreateTable request carries one key schema for the table and one for every
 * secondary index it declares, and all of them are read the same way. A refusal
 * saying only "KeySchema" would leave the reader working out which of them was
 * meant, so the subject travels with the key schema and names it.
 */
export class SimDynamoDbKeySchemaSubject {
  /**
   * How a message says where this key schema belongs, such as
   * " for index byStatus". The table's own key schema needs no such words,
   * since a request that names no index has only the one.
   */
  public readonly owner: string;

  private constructor(owner: string) {
    this.owner = owner;
  }

  /**
   * The key schema of the table itself.
   */
  static table(): SimDynamoDbKeySchemaSubject {
    return new this("");
  }

  /**
   * The key schema of one secondary index.
   */
  static index(indexName: string): SimDynamoDbKeySchemaSubject {
    return new this(` for index ${indexName}`);
  }

  /**
   * Refuse this key schema for what it says, naming which one it is.
   */
  refuse(reason: string): SimDynamoDbValidationException {
    return new SimDynamoDbValidationException(
      `Invalid KeySchema${this.owner}: ${reason}`,
    );
  }
}
