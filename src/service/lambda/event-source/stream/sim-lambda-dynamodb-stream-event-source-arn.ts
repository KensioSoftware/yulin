import { SimLambdaInvalidParameterValueException } from "../../error/sim-lambda.error.js";
import type { SimLambdaEventSourceBatchRules } from "../sim-lambda-event-source-batch-rules.js";
import { SimLambdaEventSourcePollingPermission } from "../sim-lambda-event-source-polling-permission.js";
import type { SimLambdaEventSourceStartingPositionRules } from "../sim-lambda-event-source-starting-position.js";
import {
  dynamoDbStreamBatchRules,
  dynamoDbStreamPollingOperations,
  dynamoDbStreamStartingPositionRules,
} from "./sim-lambda-dynamodb-stream-event-source-rules.js";

/**
 * A stream ARN is a table ARN with a label after it, and the label is an ISO
 * timestamp carrying two colons of its own. Splitting the ARN on colons
 * therefore cuts the label in three, so the table and the label are taken from
 * the resource part by the `table/` and `/stream/` separators instead.
 */
const streamArnPattern =
  /^arn:aws:dynamodb:(?<region>[a-z0-9-]+):(?<account>\d{12}):table\/(?<table>[\w.-]{3,255})\/stream\/(?<label>\S+)$/u;

/**
 * The DynamoDB stream ARN an event source mapping is created for.
 *
 * Everything a poller needs comes out of it: the ARN the Streams calls name,
 * the Region the event records report, and the table the stream belongs to,
 * which is what a refusal names when a function writes back into its own
 * source.
 */
export class SimLambdaDynamoDbStreamEventSourceArn {
  /**
   * How an ARN naming this kind of event source is written, for a refusal to
   * say what it wanted instead.
   */
  static readonly arnShape =
    "A DynamoDB stream ARN is " +
    "arn:aws:dynamodb:<region>:<account-id>:table/<table-name>/stream/<label>";

  public readonly kind = "dynamodb-stream" as const;
  public readonly serviceLabel = "DynamoDB Streams";
  public readonly value: string;
  public readonly regionName: string;
  public readonly accountId: string;
  public readonly tableName: string;
  public readonly label: string;
  public readonly pollingPermissions: readonly SimLambdaEventSourcePollingPermission[];

  private constructor(value: string, parts: Record<string, string>) {
    this.value = value;
    this.regionName = parts["region"] ?? "";
    this.accountId = parts["account"] ?? "";
    this.tableName = parts["table"] ?? "";
    this.label = parts["label"] ?? "";
    this.pollingPermissions = [
      ...dynamoDbStreamPollingOperations.map(
        (operation) =>
          new SimLambdaEventSourcePollingPermission(
            `dynamodb:${operation}`,
            value,
          ),
      ),
      new SimLambdaEventSourcePollingPermission("dynamodb:ListStreams", "*"),
    ];
  }

  /**
   * Read a stream ARN, answering with nothing when the ARN names something
   * else.
   *
   * This is what the event source ARN dispatcher asks, so that deciding what a
   * mapping may name stays in one place rather than in each parser.
   */
  static parse(
    streamArn: string,
  ): SimLambdaDynamoDbStreamEventSourceArn | undefined {
    const parts = streamArnPattern.exec(streamArn)?.groups;

    if (parts === undefined) {
      return undefined;
    }

    return new this(streamArn, parts);
  }

  /**
   * Read a stream ARN, refusing one that is not a stream ARN at all.
   */
  static of(streamArn: string): SimLambdaDynamoDbStreamEventSourceArn {
    const parsed = this.parse(streamArn);

    if (parsed === undefined) {
      throw new SimLambdaInvalidParameterValueException(
        `${streamArn} is not a DynamoDB stream ARN. ${this.arnShape}`,
      );
    }

    return parsed;
  }

  /**
   * The batch sizes a mapping on this stream may deliver with.
   */
  get batchRules(): SimLambdaEventSourceBatchRules {
    return dynamoDbStreamBatchRules;
  }

  /**
   * The starting positions a mapping on this stream may be created with.
   */
  get startingPositionRules(): SimLambdaEventSourceStartingPositionRules {
    return dynamoDbStreamStartingPositionRules;
  }

  /**
   * Whether this stream is in an Account and Region.
   */
  isIn(accountId: string, regionName: string): boolean {
    return this.accountId === accountId && this.regionName === regionName;
  }
}
