import type { SimArn } from "../../../../aws/arn.js";
import { SimDynamoDbValidationException } from "../../../error/dynamodb.error.js";
import type { SimDynamoDbStream } from "../../../stream/sim-dynamodb-stream.js";
import type { SimListStreamsCommandInput } from "./list-streams.command.js";

const defaultLimit = 100;
const greatestLimit = 100;

/**
 * Read the page size a ListStreams request asks for.
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
 * One page of streams, as ListStreams hands them out.
 *
 * The token is a stream ARN rather than an opaque cursor, matching the way
 * ListTables pages by table name, so a page resumes at the first ARN after it.
 */
export class SimDynamoDbStreamPage {
  public readonly streams: readonly SimDynamoDbStream[];
  public readonly lastEvaluatedStreamArn: SimArn | undefined;

  constructor(
    streams: readonly SimDynamoDbStream[],
    input: SimListStreamsCommandInput,
  ) {
    const named = this.ofTable(streams, input.TableName);
    const remaining = this.after(named, input.ExclusiveStartStreamArn);

    this.streams = remaining.slice(0, readLimit(input.Limit));
    this.lastEvaluatedStreamArn =
      this.streams.length === remaining.length
        ? undefined
        : this.streams.at(-1)?.arn;
  }

  /**
   * The streams of the table a request named, or all of them when it named
   * none.
   *
   * A table with no stream, and a name no table ever had, both list nothing.
   * Real DynamoDB does not refuse either: ListStreams reports what is there
   * rather than checking that the table is.
   */
  private ofTable(
    streams: readonly SimDynamoDbStream[],
    tableName: string | undefined,
  ): readonly SimDynamoDbStream[] {
    if (tableName === undefined) {
      return streams;
    }

    return streams.filter((stream) => stream.tableName === tableName);
  }

  /**
   * The streams left to list after the ARN a request resumes from.
   */
  private after(
    streams: readonly SimDynamoDbStream[],
    exclusiveStartStreamArn: string | undefined,
  ): readonly SimDynamoDbStream[] {
    if (exclusiveStartStreamArn === undefined) {
      return streams;
    }

    return streams.filter(
      (stream) => stream.arn.localeCompare(exclusiveStartStreamArn) > 0,
    );
  }
}
