import {
  simDynamoDbDocumentEach,
  simDynamoDbDocumentFields,
  type SimDynamoDbDocumentPath,
  simDynamoDbDocumentValues,
} from "./sim-dynamodb-document-path.js";

/**
 * Where the attribute values sit in one document Command.
 */
export interface SimDynamoDbDocumentCommandPaths {
  readonly input: SimDynamoDbDocumentPath;
  readonly output: SimDynamoDbDocumentPath;
}

/**
 * What a write answers with.
 *
 * `ItemCollectionMetrics` is not converted, because it is only reported when a
 * request asks for it with `ReturnItemCollectionMetrics`, which simulated
 * DynamoDB refuses.
 */
const writtenAttributes = simDynamoDbDocumentFields({
  Attributes: simDynamoDbDocumentValues(),
});

/**
 * A list of records of values, which is what a batch's keys and a batch's
 * answered items both are.
 */
const valueRecords = simDynamoDbDocumentEach(simDynamoDbDocumentValues());

/**
 * What a read is given: where to carry on from, and the values its expressions
 * compare against. A Query and a Scan take the same ones.
 */
const readInput = simDynamoDbDocumentFields({
  ExclusiveStartKey: simDynamoDbDocumentValues(),
  ExpressionAttributeValues: simDynamoDbDocumentValues(),
});

/**
 * What a read answers with: the items it found, and where the page after it
 * carries on from.
 */
const readPage = simDynamoDbDocumentFields({
  Items: valueRecords,
  LastEvaluatedKey: simDynamoDbDocumentValues(),
});

/**
 * One put or delete in a batch write.
 */
const batchWriteRequest = simDynamoDbDocumentFields({
  PutRequest: simDynamoDbDocumentFields({ Item: simDynamoDbDocumentValues() }),
  DeleteRequest: simDynamoDbDocumentFields({
    Key: simDynamoDbDocumentValues(),
  }),
});

/**
 * The put and delete requests every table takes in a batch write.
 */
const batchWriteRequests = simDynamoDbDocumentEach(
  simDynamoDbDocumentEach(batchWriteRequest),
);

/**
 * The keys every table is read by in a batch get.
 */
const batchGetKeys = simDynamoDbDocumentEach(
  simDynamoDbDocumentFields({ Keys: valueRecords }),
);

/**
 * One action of a transactional write that names an item by its key, which a
 * ConditionCheck, a Delete and an Update all do.
 */
const transactWriteKeyed = simDynamoDbDocumentFields({
  Key: simDynamoDbDocumentValues(),
  ExpressionAttributeValues: simDynamoDbDocumentValues(),
});

/**
 * The Put of a transactional write, which carries a whole item.
 */
const transactWritePut = simDynamoDbDocumentFields({
  Item: simDynamoDbDocumentValues(),
  ExpressionAttributeValues: simDynamoDbDocumentValues(),
});

/**
 * The actions a transactional write applies.
 *
 * An entry carries exactly one of the four, so each is named here and the
 * three the entry left out are left out of the conversion with it. Every
 * action carries its own condition, so its expression values are converted
 * alongside the item they compare against.
 */
const transactWriteActions = simDynamoDbDocumentEach(
  simDynamoDbDocumentFields({
    ConditionCheck: transactWriteKeyed,
    Put: transactWritePut,
    Delete: transactWriteKeyed,
    Update: transactWriteKeyed,
  }),
);

/**
 * One Get of a transactional read, which names an item by its key.
 */
const transactGet = simDynamoDbDocumentFields({
  Get: simDynamoDbDocumentFields({ Key: simDynamoDbDocumentValues() }),
});

/**
 * What a transactional read answers with, one entry per Get.
 */
const transactGetResponses = simDynamoDbDocumentEach(
  simDynamoDbDocumentFields({ Item: simDynamoDbDocumentValues() }),
);

/**
 * What a transactional write answers with, which is nothing to convert.
 *
 * `ItemCollectionMetrics` is the one place the real document client converts
 * this output, and it is only reported when a request asks for it with
 * `ReturnItemCollectionMetrics`, which simulated DynamoDB refuses.
 *
 * A cancelled transaction is not converted either. `CancellationReasons` reach
 * a caller on a thrown `TransactionCanceledException` rather than in an
 * answer, and the real document client leaves the `Item` of a reason as the
 * descriptors the low-level Command reports.
 */
const transactWritten = simDynamoDbDocumentFields({});

/**
 * Where each supported document Command carries native values.
 *
 * These mirror the key nodes the real document client declares on its own
 * Commands, which are internal to it, so they are stated here rather than read
 * off the Command. A wrong one shows up as a value reaching a simulated table
 * unconverted, which the round trip tests catch.
 *
 * They stop short of the real ones in one place. `Expected`,
 * `ConditionalOperator` and `AttributeUpdates` are the conditional write and
 * the update that expressions replaced, and `KeyConditions`, `QueryFilter` and
 * `ScanFilter` are the read the same expressions replaced. Simulated DynamoDB
 * refuses all six, so a request carrying one never reaches a conversion.
 * Converting input that is about to be refused would only move the refusal.
 */
export const simDynamoDbDocumentCommandPaths = {
  put: {
    input: simDynamoDbDocumentFields({
      Item: simDynamoDbDocumentValues(),
      ExpressionAttributeValues: simDynamoDbDocumentValues(),
    }),
    output: writtenAttributes,
  },
  get: {
    input: simDynamoDbDocumentFields({ Key: simDynamoDbDocumentValues() }),
    output: simDynamoDbDocumentFields({ Item: simDynamoDbDocumentValues() }),
  },
  remove: {
    input: simDynamoDbDocumentFields({
      Key: simDynamoDbDocumentValues(),
      ExpressionAttributeValues: simDynamoDbDocumentValues(),
    }),
    output: writtenAttributes,
  },
  update: {
    input: simDynamoDbDocumentFields({
      Key: simDynamoDbDocumentValues(),
      ExpressionAttributeValues: simDynamoDbDocumentValues(),
    }),
    output: writtenAttributes,
  },
  query: {
    input: readInput,
    output: readPage,
  },
  scan: {
    input: readInput,
    output: readPage,
  },
  batchWrite: {
    input: simDynamoDbDocumentFields({ RequestItems: batchWriteRequests }),
    output: simDynamoDbDocumentFields({ UnprocessedItems: batchWriteRequests }),
  },
  batchGet: {
    input: simDynamoDbDocumentFields({ RequestItems: batchGetKeys }),
    output: simDynamoDbDocumentFields({
      // Table, then item in that table's list, then attribute in that item.
      Responses: simDynamoDbDocumentEach(valueRecords),
      UnprocessedKeys: batchGetKeys,
    }),
  },
  transactWrite: {
    input: simDynamoDbDocumentFields({ TransactItems: transactWriteActions }),
    output: transactWritten,
  },
  transactGet: {
    input: simDynamoDbDocumentFields({
      TransactItems: simDynamoDbDocumentEach(transactGet),
    }),
    output: simDynamoDbDocumentFields({ Responses: transactGetResponses }),
  },
} as const satisfies Readonly<Record<string, SimDynamoDbDocumentCommandPaths>>;
