import {
  CreateFunctionCommand,
  CreateKeyValueStoreCommand,
  DeleteFunctionCommand,
  DeleteKeyValueStoreCommand,
} from "@aws-sdk/client-cloudfront";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";

async function storeArn(simAws: SimAws, name = "redirects"): Promise<string> {
  const created = await simAws
    .cloudFront()
    .keyValueStores()
    .createKeyValueStore(new CreateKeyValueStoreCommand({ Name: name }));

  return created.KeyValueStore.ARN;
}

const noopSource = Buffer.from(`
  function handler(event) {
    return event.request;
  }
`);

describe("Associating a key value store with a CloudFront Function", () => {
  it("records the store the Function may read", async () => {
    // Given a key value store
    const simAws = new SimAws();
    const kvsArn = await storeArn(simAws);

    // When a Function associates it
    await simAws.cloudFront().createFunction(
      new CreateFunctionCommand({
        Name: "reader",
        FunctionConfig: {
          Comment: "Reads a store",
          Runtime: "cloudfront-js-2.0",
          KeyValueStoreAssociations: {
            Quantity: 1,
            Items: [{ KeyValueStoreARN: kvsArn }],
          },
        },
        FunctionCode: noopSource,
      }),
    );

    // Then the Function holds that store
    const cff = simAws.cloudFront().getCloudFrontFunctionByName("reader");
    assertNonNullable(cff);
    assertIdentical(cff.keyValueStore?.arn, kvsArn);
  });

  it("leaves a Function that associates nothing without a store", async () => {
    // Given a Function created with no association
    const simAws = new SimAws();
    await simAws.cloudFront().createFunction(
      new CreateFunctionCommand({
        Name: "plain",
        FunctionConfig: { Comment: "No store", Runtime: "cloudfront-js-2.0" },
        FunctionCode: noopSource,
      }),
    );

    // When its store is read
    // Then there is none, and cf.kvs() will refuse rather than open one
    const cff = simAws.cloudFront().getCloudFrontFunctionByName("plain");
    assertNonNullable(cff);
    assertUndefined(cff.keyValueStore);
  });

  it("refuses more than one association, as CloudFront does", async () => {
    // Given two key value stores
    const simAws = new SimAws();
    const first = await storeArn(simAws, "first");
    const second = await storeArn(simAws, "second");

    // When a Function associates both
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.cloudFront().createFunction(
          new CreateFunctionCommand({
            Name: "greedy",
            FunctionConfig: {
              Comment: "Two stores",
              Runtime: "cloudfront-js-2.0",
              KeyValueStoreAssociations: {
                Quantity: 2,
                Items: [
                  { KeyValueStoreARN: first },
                  { KeyValueStoreARN: second },
                ],
              },
            },
            FunctionCode: noopSource,
          }),
        ),
    );

    // Then it is refused
    assertIdentical(error.name, "InvalidKeyValueStoreAssociation");
  });

  it("refuses an association on the 1.0 runtime", async () => {
    // Given a key value store
    const simAws = new SimAws();
    const kvsArn = await storeArn(simAws);

    // When a Function on the older runtime associates it
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.cloudFront().createFunction(
          new CreateFunctionCommand({
            Name: "old-runtime",
            FunctionConfig: {
              Comment: "Cannot read a store",
              Runtime: "cloudfront-js-1.0",
              KeyValueStoreAssociations: {
                Quantity: 1,
                Items: [{ KeyValueStoreARN: kvsArn }],
              },
            },
            FunctionCode: noopSource,
          }),
        ),
    );

    // Then it is refused rather than created and left unable to read the store
    assertIdentical(error.name, "InvalidKeyValueStoreAssociation");
  });

  it("refuses an association naming a store the Account does not hold", async () => {
    // Given a simulated CloudFront with no stores
    const simAws = new SimAws();

    // When a Function associates an ARN that resolves to nothing
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.cloudFront().createFunction(
          new CreateFunctionCommand({
            Name: "dangling",
            FunctionConfig: {
              Comment: "Names nothing",
              Runtime: "cloudfront-js-2.0",
              KeyValueStoreAssociations: {
                Quantity: 1,
                Items: [
                  {
                    KeyValueStoreARN:
                      "arn:aws:cloudfront::111111111111:key-value-store/nope",
                  },
                ],
              },
            },
            FunctionCode: noopSource,
          }),
        ),
    );

    // Then it is refused
    assertIdentical(error.name, "InvalidKeyValueStoreAssociation");
  });

  it("refuses to delete a store a Function is still associated with", async () => {
    // Given a Function holding a store open
    const simAws = new SimAws();
    const created = await simAws
      .cloudFront()
      .keyValueStores()
      .createKeyValueStore(
        new CreateKeyValueStoreCommand({ Name: "redirects" }),
      );

    await simAws.cloudFront().createFunction(
      new CreateFunctionCommand({
        Name: "holder",
        FunctionConfig: {
          Comment: "Holds the store",
          Runtime: "cloudfront-js-2.0",
          KeyValueStoreAssociations: {
            Quantity: 1,
            Items: [{ KeyValueStoreARN: created.KeyValueStore.ARN }],
          },
        },
        FunctionCode: noopSource,
      }),
    );

    // When the store is deleted
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws
          .cloudFront()
          .keyValueStores()
          .deleteKeyValueStore(
            new DeleteKeyValueStoreCommand({
              Name: "redirects",
              IfMatch: created.ETag,
            }),
          ),
    );

    // Then CloudFront refuses it and names the Function
    assertIdentical(error.name, "CannotDeleteEntityWhileInUse");
    assertStringIncludes(error.message, "holder");

    // And deleting the Function frees the store
    await simAws.cloudFront().deleteFunction(
      new DeleteFunctionCommand({
        Name: "holder",
        IfMatch: "E2QWRUHAPOMQZL",
      }),
    );

    await simAws
      .cloudFront()
      .keyValueStores()
      .deleteKeyValueStore(
        new DeleteKeyValueStoreCommand({
          Name: "redirects",
          IfMatch: created.ETag,
        }),
      );

    assertUndefined(simAws.cloudFront().keyValueStores().byName("redirects"));
  });
});
