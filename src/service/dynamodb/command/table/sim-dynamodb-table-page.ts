import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import { compareSimDynamoDbTableNames } from "../../table/sim-dynamodb-table-order.js";
import type { SimListTablesCommandInput } from "./table.command.js";

const defaultLimit = 100;
const greatestLimit = 100;

/**
 * Read the page size a ListTables request asks for.
 */
function readLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return defaultLimit;
  }

  if (!Number.isSafeInteger(limit) || limit < 1 || limit > greatestLimit) {
    throw new SimDynamoDbValidationException(
      `Limit ${limit.toString()} is invalid. It is a whole number between 1 ` +
        `and ${greatestLimit.toString()}.`,
    );
  }

  return limit;
}

/**
 * One page of table names, as ListTables hands them out.
 *
 * The token is a table name rather than an opaque cursor, so a page resumes at
 * the first name after it rather than at a remembered position. That is what
 * makes a token still work when the table it names has since been deleted.
 */
export class SimDynamoDbTablePage {
  public readonly names: readonly string[];
  public readonly lastEvaluatedTableName: string | undefined;

  constructor(names: readonly string[], input: SimListTablesCommandInput) {
    const remaining = this.after(names, input.ExclusiveStartTableName);
    const limit = readLimit(input.Limit);

    this.names = remaining.slice(0, limit);
    this.lastEvaluatedTableName = this.tokenFor(remaining, this.names);
  }

  /**
   * The names left to list after the one a request resumes from.
   */
  private after(
    names: readonly string[],
    exclusiveStartTableName: string | undefined,
  ): readonly string[] {
    if (exclusiveStartTableName === undefined) {
      return names;
    }

    return names.filter(
      (name) => compareSimDynamoDbTableNames(name, exclusiveStartTableName) > 0,
    );
  }

  /**
   * The token to resume from, when there is anything left to resume for.
   *
   * A token on the last page would send a caller looping until it got an empty
   * page, so DynamoDB leaves it off and so does this.
   */
  private tokenFor(
    remaining: readonly string[],
    page: readonly string[],
  ): string | undefined {
    if (page.length === remaining.length) {
      return undefined;
    }

    return page.at(-1);
  }
}
