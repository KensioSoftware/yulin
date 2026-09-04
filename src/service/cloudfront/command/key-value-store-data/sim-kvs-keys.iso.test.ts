import { CreateKeyValueStoreCommand } from "@aws-sdk/client-cloudfront";
import {
  DeleteKeyCommand,
  DescribeKeyValueStoreCommand,
  GetKeyCommand,
  ListKeysCommand,
  PutKeyCommand,
  UpdateKeysCommand,
} from "@aws-sdk/client-cloudfront-keyvaluestore";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertNotEqual,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimCloudFrontKeyValueStoreApi } from "../../sim-cloudfront-key-value-store.js";

/**
 * A key value store, and the data API over it, ready to write to.
 */
async function storeToWriteTo(): Promise<{
  readonly data: SimCloudFrontKeyValueStoreApi;
  readonly kvsArn: string;
  readonly eTag: string;
  readonly resourceETag: string;
}> {
  const simAws = new SimAws();
  const created = await simAws
    .cloudFront()
    .keyValueStores()
    .createKeyValueStore(new CreateKeyValueStoreCommand({ Name: "redirects" }));

  const data = simAws.cloudFrontKeyValueStore();

  // The ETag a data write has to carry is this API's own, not the one the
  // CloudFront client just returned. The two are not interchangeable.
  const described = await data.describeKeyValueStore(
    new DescribeKeyValueStoreCommand({ KvsARN: created.KeyValueStore.ARN }),
  );

  return {
    data,
    kvsArn: created.KeyValueStore.ARN,
    eTag: described.ETag,
    resourceETag: created.ETag,
  };
}

describe("CloudFront key value store data commands", () => {
  it("reads back a key that was written", async () => {
    // Given a key value store
    const { data, kvsArn, eTag } = await storeToWriteTo();

    // When a key is written and read back
    await data.putKey(
      new PutKeyCommand({
        KvsARN: kvsArn,
        Key: "/old",
        Value: "/new",
        IfMatch: eTag,
      }),
    );
    const read = await data.getKey(
      new GetKeyCommand({ KvsARN: kvsArn, Key: "/old" }),
    );

    // Then the value written is the value read, and the store reports its size
    assertIdentical(read.Value, "/new");
    assertIdentical(read.ItemCount, 1);
    assertIdentical(read.TotalSizeInBytes, 8);
  });

  it("moves the ETag on with every write", async () => {
    // Given a key value store with one key written to it
    const { data, kvsArn, eTag } = await storeToWriteTo();
    const first = await data.putKey(
      new PutKeyCommand({
        KvsARN: kvsArn,
        Key: "a",
        Value: "1",
        IfMatch: eTag,
      }),
    );

    // When a second key is written with the ETag the first write returned
    const second = await data.putKey(
      new PutKeyCommand({
        KvsARN: kvsArn,
        Key: "b",
        Value: "2",
        IfMatch: first.ETag,
      }),
    );

    // Then it is accepted, and the ETag moved on again
    assertIdentical(second.ItemCount, 2);
    assertNotEqual(second.ETag, first.ETag);
  });

  it("refuses a write carrying a stale ETag", async () => {
    // Given a key value store that has been written to once
    const { data, kvsArn, eTag } = await storeToWriteTo();
    await data.putKey(
      new PutKeyCommand({
        KvsARN: kvsArn,
        Key: "a",
        Value: "1",
        IfMatch: eTag,
      }),
    );

    // When a second write carries the ETag from before that write
    const error = await assertThrowsErrorAsync(
      async () =>
        await data.putKey(
          new PutKeyCommand({
            KvsARN: kvsArn,
            Key: "b",
            Value: "2",
            IfMatch: eTag,
          }),
        ),
    );

    // Then it is refused rather than overwriting the other writer
    assertIdentical(error.name, "PreconditionFailed");
  });

  it("forgets a deleted key", async () => {
    // Given a key value store with a key in it
    const { data, kvsArn, eTag } = await storeToWriteTo();
    const written = await data.putKey(
      new PutKeyCommand({
        KvsARN: kvsArn,
        Key: "a",
        Value: "1",
        IfMatch: eTag,
      }),
    );

    // When the key is deleted
    const deleted = await data.deleteKey(
      new DeleteKeyCommand({
        KvsARN: kvsArn,
        Key: "a",
        IfMatch: written.ETag,
      }),
    );

    // Then the store is empty
    assertIdentical(deleted.ItemCount, 0);
    assertIdentical(deleted.TotalSizeInBytes, 0);
  });

  it("refuses a read for a key that is not there", async () => {
    // Given an empty key value store
    const { data, kvsArn } = await storeToWriteTo();

    // When a key that was never written is read
    const error = await assertThrowsErrorAsync(
      async () =>
        await data.getKey(new GetKeyCommand({ KvsARN: kvsArn, Key: "nope" })),
    );

    // Then it is refused, as the data API refuses one
    assertIdentical(error.name, "ResourceNotFoundException");
  });

  it("lists every key the store holds", async () => {
    // Given a key value store with two keys
    const { data, kvsArn, eTag } = await storeToWriteTo();
    const written = await data.putKey(
      new PutKeyCommand({
        KvsARN: kvsArn,
        Key: "a",
        Value: "1",
        IfMatch: eTag,
      }),
    );
    await data.putKey(
      new PutKeyCommand({
        KvsARN: kvsArn,
        Key: "b",
        Value: "2",
        IfMatch: written.ETag,
      }),
    );

    // When the keys are listed
    const listed = await data.listKeys(new ListKeysCommand({ KvsARN: kvsArn }));

    // Then both are there with their values
    assertArrayLength(listed.Items, 2);
    assertIdentical(listed.Items[1].Key, "b");
    assertIdentical(listed.Items[1].Value, "2");
  });

  it("applies a batch of puts and deletes together", async () => {
    // Given a key value store holding a key that is about to go
    const { data, kvsArn, eTag } = await storeToWriteTo();
    const written = await data.putKey(
      new PutKeyCommand({
        KvsARN: kvsArn,
        Key: "gone",
        Value: "1",
        IfMatch: eTag,
      }),
    );

    // When a batch writes two keys and deletes that one
    const updated = await data.updateKeys(
      new UpdateKeysCommand({
        KvsARN: kvsArn,
        IfMatch: written.ETag,
        Puts: [
          { Key: "a", Value: "1" },
          { Key: "b", Value: "2" },
        ],
        Deletes: [{ Key: "gone" }],
      }),
    );

    // Then both writes and the delete landed in the one call
    assertIdentical(updated.ItemCount, 2);

    const listed = await data.listKeys(new ListKeysCommand({ KvsARN: kvsArn }));
    assertArrayLength(listed.Items, 2);
  });

  it("deletes a key a batch both writes and deletes", async () => {
    // Given a key value store
    const { data, kvsArn, eTag } = await storeToWriteTo();

    // When one batch both writes and deletes the same key
    await data.updateKeys(
      new UpdateKeysCommand({
        KvsARN: kvsArn,
        IfMatch: eTag,
        Puts: [{ Key: "both", Value: "1" }],
        Deletes: [{ Key: "both" }],
      }),
    );

    // Then the delete is what stands, because the deletes land last
    const listed = await data.listKeys(new ListKeysCommand({ KvsARN: kvsArn }));
    assertArrayEmpty(listed.Items);
  });

  it("applies a batch that carries neither puts nor deletes", async () => {
    // Given a key value store
    const { data, kvsArn, eTag } = await storeToWriteTo();

    // When a batch arrives with nothing in it
    const updated = await data.updateKeys(
      new UpdateKeysCommand({ KvsARN: kvsArn, IfMatch: eTag }),
    );

    // Then it is accepted and changes nothing but the ETag
    assertIdentical(updated.ItemCount, 0);
    assertNotEqual(updated.ETag, eTag);
  });

  it("describes the data in the store", async () => {
    // Given a key value store with a key in it
    const { data, kvsArn, eTag } = await storeToWriteTo();
    await data.putKey(
      new PutKeyCommand({
        KvsARN: kvsArn,
        Key: "a",
        Value: "1",
        IfMatch: eTag,
      }),
    );

    // When the store is described through the data API
    const described = await data.describeKeyValueStore(
      new DescribeKeyValueStoreCommand({ KvsARN: kvsArn }),
    );

    // Then it answers with the data rather than the resource, which is what
    // this client's DescribeKeyValueStore does
    assertIdentical(described.KvsARN, kvsArn);
    assertIdentical(described.ItemCount, 1);
    assertIdentical(described.TotalSizeInBytes, 2);
    assertIdentical(described.Status, "PROVISIONING");
  });

  it("refuses a data write carrying the CloudFront client's ETag", async () => {
    // Given a store, and the ETag its CreateKeyValueStore returned
    const { data, kvsArn, resourceETag } = await storeToWriteTo();

    // When a key write carries that ETag rather than the data API's own
    const error = await assertThrowsErrorAsync(
      async () =>
        await data.putKey(
          new PutKeyCommand({
            KvsARN: kvsArn,
            Key: "a",
            Value: "1",
            IfMatch: resourceETag,
          }),
        ),
    );

    // Then it is refused, because the two ETags are not interchangeable
    assertIdentical(error.name, "PreconditionFailed");
  });

  it("refuses a command naming a store that does not exist", async () => {
    // Given a simulated key value store data API
    const { data } = await storeToWriteTo();
    const missing = "arn:aws:cloudfront::111111111111:key-value-store/nope";

    // When a command names a store this Account does not hold
    const error = await assertThrowsErrorAsync(
      async () =>
        await data.getKey(new GetKeyCommand({ KvsARN: missing, Key: "a" })),
    );

    // Then it is refused
    assertIdentical(error.name, "ResourceNotFoundException");
  });

  it("refuses a command that leaves out what the data API requires", async () => {
    // Given a key value store
    const { data, kvsArn, eTag } = await storeToWriteTo();

    // When commands arrive without the ARN, key, value or ETag required.
    // These go in as plain input rather than through the SDK command classes,
    // whose own types make a missing required member unrepresentable. A
    // JavaScript caller and an intercepted client can still send one.
    // Then each is refused rather than being applied with a missing value
    await Promise.all(
      [
        async (): Promise<unknown> => await data.getKey({ input: {} }),
        async (): Promise<unknown> =>
          await data.getKey({ input: { KvsARN: kvsArn } }),
        async (): Promise<unknown> => await data.listKeys({ input: {} }),
        async (): Promise<unknown> =>
          await data.describeKeyValueStore({ input: {} }),
        async (): Promise<unknown> =>
          await data.putKey({ input: { KvsARN: kvsArn, Key: "a" } }),
        async (): Promise<unknown> =>
          await data.putKey({
            input: { KvsARN: kvsArn, Key: "a", Value: "1" },
          }),
        async (): Promise<unknown> =>
          await data.deleteKey({ input: { KvsARN: kvsArn, Key: "a" } }),
        async (): Promise<unknown> =>
          await data.updateKeys({ input: { IfMatch: eTag } }),
      ].map(async (incomplete) => await assertThrowsErrorAsync(incomplete)),
    );
  });

  it("refuses a batch entry with no key or no value", async () => {
    // Given a key value store
    const { data, kvsArn, eTag } = await storeToWriteTo();

    // When a batch carries an entry missing its key or its value, which the
    // SDK types allow because it marks a required member as possibly undefined
    // Then it is refused rather than writing "undefined" as a key or a value
    await Promise.all(
      [
        async (): Promise<unknown> =>
          await data.updateKeys({
            input: {
              KvsARN: kvsArn,
              IfMatch: eTag,
              Puts: [{ Key: undefined, Value: "1" }],
            },
          }),
        async (): Promise<unknown> =>
          await data.updateKeys({
            input: {
              KvsARN: kvsArn,
              IfMatch: eTag,
              Puts: [{ Key: "a", Value: undefined }],
            },
          }),
        async (): Promise<unknown> =>
          await data.updateKeys({
            input: {
              KvsARN: kvsArn,
              IfMatch: eTag,
              Deletes: [{ Key: undefined }],
            },
          }),
      ].map(async (incomplete) => await assertThrowsErrorAsync(incomplete)),
    );
  });
});
