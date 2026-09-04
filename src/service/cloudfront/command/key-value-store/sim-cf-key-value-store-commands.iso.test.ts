import {
  CreateKeyValueStoreCommand,
  DeleteKeyValueStoreCommand,
  DescribeKeyValueStoreCommand,
  ListKeyValueStoresCommand,
  UpdateKeyValueStoreCommand,
} from "@aws-sdk/client-cloudfront";
import {
  assertArrayLength,
  assertIdentical,
  assertNotEqual,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";

describe("CloudFront key value store commands", () => {
  it("creates a key value store that provisions in the background", async () => {
    // Given a simulated CloudFront
    const simAws = new SimAws();
    const stores = simAws.cloudFront().keyValueStores();

    // When a key value store is created
    const created = await stores.createKeyValueStore(
      new CreateKeyValueStoreCommand({
        Name: "redirects",
        Comment: "Where old paths go",
      }),
    );

    // Then it exists straight away, and is not servable yet
    assertIdentical(created.KeyValueStore.Name, "redirects");
    assertIdentical(created.KeyValueStore.Comment, "Where old paths go");
    assertIdentical(created.KeyValueStore.Status, "PROVISIONING");
    assertIdentical(
      created.KeyValueStore.ARN,
      `arn:aws:cloudfront::${simAws.account().accountId}:key-value-store/${created.KeyValueStore.Id}`,
    );

    // And it becomes READY once provisioning finishes
    await simAws.backgroundTasksComplete();
    assertIdentical(stores.byName("redirects")?.status, "READY");
  });

  it("describes a key value store by name", async () => {
    // Given a key value store
    const simAws = new SimAws();
    const stores = simAws.cloudFront().keyValueStores();
    const created = await stores.createKeyValueStore(
      new CreateKeyValueStoreCommand({ Name: "redirects" }),
    );

    // When it is described
    const described = await stores.describeKeyValueStore(
      new DescribeKeyValueStoreCommand({ Name: "redirects" }),
    );

    // Then the same store comes back, with the ETag a write has to match
    assertIdentical(described.KeyValueStore.Id, created.KeyValueStore.Id);
    assertIdentical(described.ETag, created.ETag);
  });

  it("lists the key value stores this Account holds", async () => {
    // Given two key value stores
    const simAws = new SimAws();
    const stores = simAws.cloudFront().keyValueStores();
    await stores.createKeyValueStore(
      new CreateKeyValueStoreCommand({ Name: "redirects" }),
    );
    await stores.createKeyValueStore(
      new CreateKeyValueStoreCommand({ Name: "flags" }),
    );

    // When they are listed
    const listed = await stores.listKeyValueStores(
      new ListKeyValueStoresCommand({}),
    );

    // Then both are there, counted the way CloudFront counts them
    assertIdentical(listed.KeyValueStoreList.Quantity, 2);
    assertArrayLength(listed.KeyValueStoreList.Items, 2);
  });

  it("lists only the key value stores in a requested status", async () => {
    // Given one provisioned store and one still provisioning
    const simAws = new SimAws();
    const stores = simAws.cloudFront().keyValueStores();
    await stores.createKeyValueStore(
      new CreateKeyValueStoreCommand({ Name: "ready-one" }),
    );
    await simAws.backgroundTasksComplete();
    await stores.createKeyValueStore(
      new CreateKeyValueStoreCommand({ Name: "provisioning-one" }),
    );

    // When only the ready ones are listed
    const listed = await stores.listKeyValueStores(
      new ListKeyValueStoresCommand({ Status: "READY" }),
    );

    // Then the one still provisioning is left out
    assertArrayLength(listed.KeyValueStoreList.Items, 1);
    assertIdentical(listed.KeyValueStoreList.Items[0].Name, "ready-one");
  });

  it("updates a key value store's comment against its ETag", async () => {
    // Given a key value store with a comment
    const simAws = new SimAws();
    const stores = simAws.cloudFront().keyValueStores();
    const created = await stores.createKeyValueStore(
      new CreateKeyValueStoreCommand({ Name: "redirects", Comment: "first" }),
    );

    // When the comment is updated with the current ETag
    const updated = await stores.updateKeyValueStore(
      new UpdateKeyValueStoreCommand({
        Name: "redirects",
        Comment: "second",
        IfMatch: created.ETag,
      }),
    );

    // Then the comment changed, and the ETag moved on with it
    assertIdentical(updated.KeyValueStore.Comment, "second");
    assertNotEqual(updated.ETag, created.ETag);
  });

  it("deletes a key value store against its ETag", async () => {
    // Given a key value store
    const simAws = new SimAws();
    const stores = simAws.cloudFront().keyValueStores();
    const created = await stores.createKeyValueStore(
      new CreateKeyValueStoreCommand({ Name: "redirects" }),
    );

    // When it is deleted with the current ETag
    await stores.deleteKeyValueStore(
      new DeleteKeyValueStoreCommand({
        Name: "redirects",
        IfMatch: created.ETag,
      }),
    );

    // Then it is gone
    assertUndefined(stores.byName("redirects"));
    assertUndefined(stores.byId(created.KeyValueStore.Id));
  });
});
