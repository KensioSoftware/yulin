import type { SimSdkCommandRoute } from "../../../sdk/index.js";
import type * as simDynamoDbCommands from "../command/sim-dynamodb-command.types.js";
import type { SimDynamoDb } from "../sim-dynamodb.js";
import type { SimDynamoDbRequestOptions } from "../sim-dynamodb.types.js";
import {
  type SimDynamoDbDocumentCommandPaths,
  simDynamoDbDocumentCommandPaths as paths,
} from "./sim-dynamodb-document-command-paths.js";
import { SimDynamoDbDocumentRoute } from "./sim-dynamodb-document-route.js";

/**
 * Send one converted request to the simulated operation it stands for.
 */
type SimDynamoDbDocumentSend = (
  input: never,
  options: SimDynamoDbRequestOptions | undefined,
) => Promise<object>;

/**
 * Build the route for one document Command.
 */
function documentRoute(
  commandPaths: SimDynamoDbDocumentCommandPaths,
  send: SimDynamoDbDocumentSend,
): SimSdkCommandRoute {
  return new SimDynamoDbDocumentRoute({
    input: commandPaths.input,
    output: commandPaths.output,
    send: async (input, options) => await send(input as never, options),
  }).route();
}

/**
 * Build the routed entry for one document Command with a name of its own.
 */
function namedDocumentRoute(
  name: string,
  commandPaths: SimDynamoDbDocumentCommandPaths,
  send: SimDynamoDbDocumentSend,
): readonly [string, SimSdkCommandRoute] {
  return [name, documentRoute(commandPaths, send)];
}

/**
 * The document routes for the two Commands `@aws-sdk/lib-dynamodb` names
 * exactly as `@aws-sdk/client-dynamodb` does.
 *
 * These cannot be routed by name on their own. Each is paired with the client
 * route of the same name by `SimDynamoDbSharedNameRoute`, which asks the
 * Command which client it came from.
 */
export function simDynamoDbDocumentSharedNameRoutes(dynamoDb: SimDynamoDb): {
  readonly query: SimSdkCommandRoute;
  readonly scan: SimSdkCommandRoute;
} {
  return {
    query: documentRoute(
      paths.query,
      async (input: simDynamoDbCommands.SimQueryCommandInput, options) =>
        await dynamoDb.query({ input }, options),
    ),
    scan: documentRoute(
      paths.scan,
      async (input: simDynamoDbCommands.SimScanCommandInput, options) =>
        await dynamoDb.scan({ input }, options),
    ),
  };
}

/**
 * The routes that handle the `@aws-sdk/lib-dynamodb` document client Commands
 * with a name of their own.
 *
 * Most document Commands are named differently to the Command they stand for,
 * so `PutCommand` and `PutItemCommand` route separately and only the document
 * one converts. Everything after the conversion is the ordinary operation: the
 * same validation, the same authorization, the same simulated table.
 *
 * `QueryCommand` and `ScanCommand` share their names with client Commands and
 * so are routed by `simDynamoDbDocumentSharedNameRoutes` instead.
 *
 * An operation with no document route at all, such as a document
 * `TransactWriteCommand`, is refused by name like any other unsupported
 * Command, rather than failing part way through a conversion.
 */
export function simDynamoDbDocumentRoutes(
  dynamoDb: SimDynamoDb,
): readonly (readonly [string, SimSdkCommandRoute])[] {
  return [
    namedDocumentRoute(
      "PutCommand",
      paths.put,
      async (input: simDynamoDbCommands.SimPutItemCommandInput, options) =>
        await dynamoDb.putItem({ input }, options),
    ),
    namedDocumentRoute(
      "GetCommand",
      paths.get,
      async (input: simDynamoDbCommands.SimGetItemCommandInput, options) =>
        await dynamoDb.getItem({ input }, options),
    ),
    namedDocumentRoute(
      "DeleteCommand",
      paths.remove,
      async (input: simDynamoDbCommands.SimDeleteItemCommandInput, options) =>
        await dynamoDb.deleteItem({ input }, options),
    ),
    namedDocumentRoute(
      "UpdateCommand",
      paths.update,
      async (input: simDynamoDbCommands.SimUpdateItemCommandInput, options) =>
        await dynamoDb.updateItem({ input }, options),
    ),
    namedDocumentRoute(
      "BatchWriteCommand",
      paths.batchWrite,
      async (
        input: simDynamoDbCommands.SimBatchWriteItemCommandInput,
        options,
      ) => await dynamoDb.batchWriteItem({ input }, options),
    ),
    namedDocumentRoute(
      "BatchGetCommand",
      paths.batchGet,
      async (input: simDynamoDbCommands.SimBatchGetItemCommandInput, options) =>
        await dynamoDb.batchGetItem({ input }, options),
    ),
  ];
}
