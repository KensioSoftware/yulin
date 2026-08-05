/**
 * The properties `@aws-sdk/lib-dynamodb` declares on every one of its Commands.
 *
 * They are TypeScript `protected`, which means nothing at runtime, so a
 * document Command carries them where the client Command of the same name does
 * not. That is what tells a document `QueryCommand` from a client one, since
 * the two share a class name.
 */
const documentCommandProperties: readonly string[] = [
  "inputKeyNodes",
  "outputKeyNodes",
  "clientCommand",
];

/**
 * Whether an intercepted Command came from the document client.
 */
export function isSimDynamoDbDocumentCommand(command: object): boolean {
  return documentCommandProperties.every((property) =>
    Object.hasOwn(command, property),
  );
}
