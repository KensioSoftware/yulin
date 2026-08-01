import { SimDynamoDbUnsupportedOperation } from "../error/dynamodb.error.js";

/**
 * The properties `@aws-sdk/lib-dynamodb` declares on every one of its Commands.
 *
 * They are TypeScript `protected`, which means nothing at runtime, so a
 * document Command carries them where the client Command of the same name does
 * not.
 */
const documentCommandProperties: readonly string[] = [
  "inputKeyNodes",
  "outputKeyNodes",
  "clientCommand",
];

/**
 * Whether an intercepted Command came from the document client.
 */
function isSimDynamoDbDocumentCommand(command: object): boolean {
  return documentCommandProperties.every((property) =>
    Object.hasOwn(command, property),
  );
}

/**
 * Refuse a document Command that shares its name with a client Command.
 *
 * The SDK router keys on the Command's class name, and `QueryCommand` and
 * `ScanCommand` are named the same in `@aws-sdk/client-dynamodb` and in
 * `@aws-sdk/lib-dynamodb`, unlike `PutCommand` and `PutItemCommand`. A document
 * Command reaching the client operation would have its native JavaScript values
 * read as AttributeValues, so it is refused by name instead.
 */
export function refuseSimDynamoDbDocumentCommand(
  command: object,
  commandName: string,
): void {
  if (!isSimDynamoDbDocumentCommand(command)) {
    return;
  }

  throw new SimDynamoDbUnsupportedOperation(
    `The document client's ${commandName} is not simulated. It shares its ` +
      `name with the ${commandName} of @aws-sdk/client-dynamodb, which is, so ` +
      `it is refused rather than read as though it carried AttributeValues.`,
  );
}
