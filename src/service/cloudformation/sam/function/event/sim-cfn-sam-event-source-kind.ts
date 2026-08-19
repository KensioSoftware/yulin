import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../template/value/sim-cfn-template-value.js";

/**
 * What one kind of polled event source is called and what polling it takes.
 */
export interface SamEventSourceKind {
  /** The event property naming what the mapping polls. */
  readonly sourceProperty: string;
  /** The statements the execution Role polls the source under. */
  readonly pollingStatements: (
    source: SimCfnTemplateValue,
  ) => readonly SimCfnTemplateValueRecord[];
}

/**
 * A queue, polled with the three operations a poller performs on one, on the
 * queue itself.
 */
export const samSqsEventSource: SamEventSourceKind = {
  sourceProperty: "Queue",
  pollingStatements: (source) => [
    {
      Effect: "Allow",
      Action: [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes",
      ],
      Resource: source,
    },
  ],
};

/**
 * A table's stream, read with three operations on the stream and listed across
 * every stream.
 *
 * The split is the one the DynamoDB Streams API forces, since a stream cannot
 * be listed by its own ARN, and it is how CDK writes the same grant.
 */
export const samDynamoDbEventSource: SamEventSourceKind = {
  sourceProperty: "Stream",
  pollingStatements: (source) => [
    {
      Effect: "Allow",
      Action: [
        "dynamodb:DescribeStream",
        "dynamodb:GetRecords",
        "dynamodb:GetShardIterator",
      ],
      Resource: source,
    },
    { Effect: "Allow", Action: "dynamodb:ListStreams", Resource: "*" },
  ],
};
