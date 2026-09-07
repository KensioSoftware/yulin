import {
  CreateTableCommand,
  DynamoDBClient,
  GetItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  type TranslateConfig,
} from "@aws-sdk/lib-dynamodb";
import {
  assertInstanceOf,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimSdk } from "../../../sdk/index.js";
import { SimDynamoDbDocumentValueError } from "../error/dynamodb.error.js";
import {
  simDynamoDbDocumentMarshallDefaults,
  simDynamoDbDocumentMarshallOptions,
} from "./sim-dynamodb-document-marshall-options.js";

/**
 * An object with behaviour, which is what `convertClassInstanceToMap` decides
 * the fate of.
 */
class Address {
  readonly street: string;

  constructor(street: string) {
    this.street = street;
  }

  label(): string {
    return this.street;
  }
}

/**
 * An intercepted document client over a table keyed by `id`.
 */
async function interceptedDocuments(
  simSdk: SimSdk,
  translateConfig?: TranslateConfig,
): Promise<DynamoDBDocumentClient> {
  const documents = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: "eu-west-2" }),
    translateConfig,
  );
  simSdk.intercept(documents);

  await documents.send(
    new CreateTableCommand({
      TableName: "OptionsTable",
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    }),
  );
  await simSdk.simAws.backgroundTasksComplete();

  return documents;
}

/**
 * Write one attribute natively and read the descriptor it was stored as.
 */
async function storedAs(
  simSdk: SimSdk,
  documents: DynamoDBDocumentClient,
  value: unknown,
): Promise<unknown> {
  await documents.send(
    new PutCommand({ TableName: "OptionsTable", Item: { id: "a", value } }),
  );

  const read = await simSdk.simAws
    .region("eu-west-2")
    .dynamoDb()
    .getItem(
      new GetItemCommand({
        TableName: "OptionsTable",
        Key: { id: { S: "a" } },
      }),
    );

  return read.Item?.["value"];
}

describe("simulated DynamoDB document marshalling options", () => {
  it("writes an empty string as NULL for convertEmptyValues", async () => {
    // Given a client that converts empty values.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk, {
      marshallOptions: { convertEmptyValues: true },
    });

    // When an empty string is written.
    const stored = await storedAs(simSdk, documents, "");

    // Then it went in as NULL rather than as an empty string.
    assertObjectEquals(stored, { NULL: true });
  });

  it("writes an empty string as it stands when the client asked for none", async () => {
    // Given a client built with no options of its own.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk);

    // When an empty string is written.
    const stored = await storedAs(simSdk, documents, "");

    // Then it went in as the string it is, which DynamoDB has held since it
    // started accepting empty non-key attributes.
    assertObjectEquals(stored, { S: "" });
  });

  it("writes an empty Set as NULL for convertEmptyValues", async () => {
    // Given a client that converts empty values.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk, {
      marshallOptions: { convertEmptyValues: true },
    });

    // When an empty Set is written, which DynamoDB has no attribute for.
    const stored = await storedAs(simSdk, documents, new Set());

    // Then it went in as NULL rather than being refused.
    assertObjectEquals(stored, { NULL: true });
  });

  it("writes an empty binary value as NULL for convertEmptyValues", async () => {
    // Given a client that converts empty values.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk, {
      marshallOptions: { convertEmptyValues: true },
    });

    // When a binary value holding no bytes is written.
    const stored = await storedAs(simSdk, documents, new Uint8Array(0));

    // Then it went in as NULL.
    assertObjectEquals(stored, { NULL: true });
  });

  it("writes a class instance as a map for convertClassInstanceToMap", async () => {
    // Given a client that converts class instances.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk, {
      marshallOptions: { convertClassInstanceToMap: true },
    });

    // When an object with behaviour is written.
    const stored = await storedAs(simSdk, documents, new Address("1 High St"));

    // Then its own properties went in as a map, and its methods did not.
    assertObjectEquals(stored, { M: { street: { S: "1 High St" } } });
  });

  it("refuses a class instance when the client asked for none", async () => {
    // Given a client built with no options of its own.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk);

    // When an object with behaviour is written.
    const error = await assertThrowsErrorAsync(async () => {
      await storedAs(simSdk, documents, new Address("1 High St"));
    });

    // Then it is refused rather than quietly flattened into attributes.
    assertInstanceOf(error, SimDynamoDbDocumentValueError);
    assertStringIncludes(error.message, "input.Item.value");
  });

  it("writes a number past the safe range for allowImpreciseNumbers", async () => {
    // Given a client that allows imprecise numbers.
    using simSdk = new SimSdk();
    const documents = await interceptedDocuments(simSdk, {
      marshallOptions: { allowImpreciseNumbers: true },
    });

    // When a number too large for a JavaScript number to hold exactly is
    // written.
    const stored = await storedAs(simSdk, documents, 2 ** 60);

    // Then it went in with the digits it had already been rounded to, which
    // is the loss the option takes on.
    assertObjectEquals(stored, { N: "1152921504606847000" });
  });

  it("reads the options of the client each Command was sent through", async () => {
    // Given two document clients over one simulation, one dropping undefined
    // values and one built with no options of its own.
    using simSdk = new SimSdk();
    const dropping = await interceptedDocuments(simSdk, {
      marshallOptions: { removeUndefinedValues: true },
    });
    const strict = DynamoDBDocumentClient.from(
      new DynamoDBClient({ region: "eu-west-2" }),
    );
    simSdk.intercept(strict);

    // When the same item is written through each.
    const item = { id: "a", page: { title: "t", summary: undefined } };
    await dropping.send(
      new PutCommand({ TableName: "OptionsTable", Item: item }),
    );
    const error = await assertThrowsErrorAsync(async () => {
      await strict.send(
        new PutCommand({ TableName: "OptionsTable", Item: item }),
      );
    });

    // Then each Command was converted by the options of the client it was sent
    // through, rather than by whichever client was intercepted first.
    assertInstanceOf(error, SimDynamoDbDocumentValueError);
    assertStringIncludes(error.message, "removeUndefinedValues");
  });
});

describe("simulated DynamoDB document marshalling option defaults", () => {
  it("converts by the defaults for a send with no client behind it", () => {
    // When the options are read off nothing, as a request bridged from the
    // wire arrives with, or off a client whose config has yet to resolve.
    const nothing = simDynamoDbDocumentMarshallOptions(undefined);
    const unresolved = simDynamoDbDocumentMarshallOptions({});

    // Then every option is off, which is where the real client leaves them.
    assertObjectEquals(nothing, simDynamoDbDocumentMarshallDefaults);
    assertObjectEquals(unresolved, simDynamoDbDocumentMarshallDefaults);
  });

  it("converts by the defaults for a client that named no options", () => {
    // When the options are read off a client built with no translate config,
    // and off one whose translate config named no marshalling options.
    const untranslated = simDynamoDbDocumentMarshallOptions({ config: {} });
    const unnamed = simDynamoDbDocumentMarshallOptions({
      config: { translateConfig: {} },
    });

    // Then both convert by the defaults.
    assertObjectEquals(untranslated, simDynamoDbDocumentMarshallDefaults);
    assertObjectEquals(unnamed, simDynamoDbDocumentMarshallDefaults);
  });
});
