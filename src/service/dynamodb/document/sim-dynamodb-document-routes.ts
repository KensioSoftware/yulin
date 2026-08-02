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
 * Build the routed entry for one document Command.
 */
function documentRoute(
  name: string,
  commandPaths: SimDynamoDbDocumentCommandPaths,
  send: SimDynamoDbDocumentSend,
): readonly [string, SimSdkCommandRoute] {
  return [
    name,
    new SimDynamoDbDocumentRoute({
      input: commandPaths.input,
      output: commandPaths.output,
      send: async (input, options) => await send(input as never, options),
    }).route(),
  ];
}

/**
 * The routes that handle `@aws-sdk/lib-dynamodb` document client Commands.
 *
 * A document Command is named differently to the Command it stands for, so
 * `PutCommand` and `PutItemCommand` route separately and only the document one
 * converts. Everything after the conversion is the ordinary operation: the same
 * validation, the same authorization, the same simulated table.
 *
 * An operation with no document route here, such as a document
 * `TransactWriteCommand`, is refused by name like any other unsupported
 * Command, rather than failing part way through a conversion.
 */
export function simDynamoDbDocumentRoutes(
  dynamoDb: SimDynamoDb,
): readonly (readonly [string, SimSdkCommandRoute])[] {
  return [
    documentRoute(
      "PutCommand",
      paths.put,
      async (input: simDynamoDbCommands.SimPutItemCommandInput, options) =>
        await dynamoDb.putItem({ input }, options),
    ),
    documentRoute(
      "GetCommand",
      paths.get,
      async (input: simDynamoDbCommands.SimGetItemCommandInput, options) =>
        await dynamoDb.getItem({ input }, options),
    ),
    documentRoute(
      "DeleteCommand",
      paths.remove,
      async (input: simDynamoDbCommands.SimDeleteItemCommandInput, options) =>
        await dynamoDb.deleteItem({ input }, options),
    ),
    documentRoute(
      "UpdateCommand",
      paths.update,
      async (input: simDynamoDbCommands.SimUpdateItemCommandInput, options) =>
        await dynamoDb.updateItem({ input }, options),
    ),
    documentRoute(
      "BatchWriteCommand",
      paths.batchWrite,
      async (
        input: simDynamoDbCommands.SimBatchWriteItemCommandInput,
        options,
      ) => await dynamoDb.batchWriteItem({ input }, options),
    ),
    documentRoute(
      "BatchGetCommand",
      paths.batchGet,
      async (input: simDynamoDbCommands.SimBatchGetItemCommandInput, options) =>
        await dynamoDb.batchGetItem({ input }, options),
    ),
  ];
}
