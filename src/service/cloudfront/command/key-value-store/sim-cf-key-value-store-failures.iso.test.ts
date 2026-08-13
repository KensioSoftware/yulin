import {
  CreateKeyValueStoreCommand,
  DeleteKeyValueStoreCommand,
  DescribeKeyValueStoreCommand,
  UpdateKeyValueStoreCommand,
} from "@aws-sdk/client-cloudfront";
import { assertIdentical, assertThrowsErrorAsync } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimCfKeyValueStoreCommands } from "../../key-value-store/sim-cf-key-value-store-commands.js";

async function storesWithRedirects(): Promise<{
  readonly stores: SimCfKeyValueStoreCommands;
  readonly eTag: string;
}> {
  const stores = new SimAws().cloudFront().keyValueStores();
  const created = await stores.createKeyValueStore(
    new CreateKeyValueStoreCommand({ Name: "redirects" }),
  );

  return { stores, eTag: created.ETag };
}

describe("CloudFront key value store command failures", () => {
  it("refuses a second key value store claiming a name", async () => {
    // Given a key value store called redirects
    const { stores } = await storesWithRedirects();

    // When another store claims that name
    const error = await assertThrowsErrorAsync(
      async () =>
        await stores.createKeyValueStore(
          new CreateKeyValueStoreCommand({ Name: "redirects" }),
        ),
    );

    // Then it is refused, as CloudFront refuses one
    assertIdentical(error.name, "EntityAlreadyExists");
  });

  it("refuses a describe for a name no key value store holds", async () => {
    // Given a simulated CloudFront with no stores
    const stores = new SimAws().cloudFront().keyValueStores();

    // When a store that does not exist is described
    const error = await assertThrowsErrorAsync(
      async () =>
        await stores.describeKeyValueStore(
          new DescribeKeyValueStoreCommand({ Name: "missing" }),
        ),
    );

    // Then it is refused
    assertIdentical(error.name, "EntityNotFound");
  });

  it("refuses an update carrying a stale ETag", async () => {
    // Given a key value store that has changed since its ETag was read
    const { stores, eTag } = await storesWithRedirects();
    await stores.updateKeyValueStore(
      new UpdateKeyValueStoreCommand({
        Name: "redirects",
        Comment: "moved on",
        IfMatch: eTag,
      }),
    );

    // When a second update carries the ETag from before that change
    const error = await assertThrowsErrorAsync(
      async () =>
        await stores.updateKeyValueStore(
          new UpdateKeyValueStoreCommand({
            Name: "redirects",
            Comment: "too late",
            IfMatch: eTag,
          }),
        ),
    );

    // Then it is refused rather than overwriting the other write
    assertIdentical(error.name, "PreconditionFailed");
    assertIdentical(stores.byName("redirects")?.comment, "moved on");
  });

  it("refuses a delete carrying a stale ETag", async () => {
    // Given a key value store that has changed since its ETag was read
    const { stores, eTag } = await storesWithRedirects();
    await stores.updateKeyValueStore(
      new UpdateKeyValueStoreCommand({
        Name: "redirects",
        Comment: "moved on",
        IfMatch: eTag,
      }),
    );

    // When a delete carries the ETag from before that change
    const error = await assertThrowsErrorAsync(
      async () =>
        await stores.deleteKeyValueStore(
          new DeleteKeyValueStoreCommand({
            Name: "redirects",
            IfMatch: eTag,
          }),
        ),
    );

    // Then it is refused and the store is still there
    assertIdentical(error.name, "PreconditionFailed");
    assertIdentical(stores.byName("redirects")?.name, "redirects");
  });

  it("refuses a delete for a name no key value store holds", async () => {
    // Given a simulated CloudFront with no stores
    const stores = new SimAws().cloudFront().keyValueStores();

    // When a store that does not exist is deleted
    const error = await assertThrowsErrorAsync(
      async () =>
        await stores.deleteKeyValueStore(
          new DeleteKeyValueStoreCommand({
            Name: "missing",
            IfMatch: "E1111111111111",
          }),
        ),
    );

    // Then it is refused
    assertIdentical(error.name, "EntityNotFound");
  });

  it("refuses a command that leaves out what CloudFront requires", async () => {
    // Given a key value store
    const { stores } = await storesWithRedirects();

    // When commands arrive without the name or the ETag CloudFront requires.
    // These go in as plain input rather than through the SDK command classes,
    // whose own types make a missing required member unrepresentable. A
    // JavaScript caller and an intercepted client can still send one.
    // Then each is refused rather than being applied with a missing value
    await Promise.all(
      [
        async (): Promise<unknown> =>
          await stores.createKeyValueStore({ input: {} }),
        async (): Promise<unknown> =>
          await stores.describeKeyValueStore({ input: {} }),
        async (): Promise<unknown> =>
          await stores.updateKeyValueStore({ input: { Name: "redirects" } }),
        async (): Promise<unknown> =>
          await stores.deleteKeyValueStore({ input: { Name: "redirects" } }),
      ].map(async (incomplete) => await assertThrowsErrorAsync(incomplete)),
    );
  });
});
