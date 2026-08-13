import {
  assertBufferEqual,
  assertFalse,
  assertInstanceOf,
  assertIdentical,
  assertObjectEquals,
  assertThrowsError,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimCloudFrontKeyValueStore } from "../../key-value-store/sim-cf-key-value-store.js";
import { cffCloudFrontModule } from "./cff-cloudfront-module.js";

function storeHolding(
  pairs: Record<string, string>,
): SimCloudFrontKeyValueStore {
  const store = new SimCloudFrontKeyValueStore({ name: "redirects" });

  for (const [key, value] of Object.entries(pairs)) {
    store.keys.put(key, value);
  }

  return store;
}

describe("The kvs handle a CloudFront Function gets", () => {
  it("reads a value as a string by default", async () => {
    // Given a store with a key
    const cf = cffCloudFrontModule(storeHolding({ "/old": "/new" }));

    // When the Function reads it without asking for a format
    // Then it comes back as the stored string
    assertIdentical(await cf.kvs().get("/old"), "/new");
  });

  it("reads a value as JSON when asked", async () => {
    // Given a store holding a JSON document
    const cf = cffCloudFrontModule(
      storeHolding({ flags: '{"beta":true,"rollout":10}' }),
    );

    // When the Function asks for the json format
    const value = await cf.kvs().get("flags", { format: "json" });

    // Then it comes back parsed
    assertObjectEquals(value, { beta: true, rollout: 10 });
  });

  it("reads a value as bytes when asked", async () => {
    // Given a store with a key
    const cf = cffCloudFrontModule(storeHolding({ k: "hi" }));

    // When the Function asks for the bytes format
    const value = await cf.kvs().get("k", { format: "bytes" });

    // Then it comes back as the value's UTF-8 bytes
    assertInstanceOf(value, Buffer);
    assertBufferEqual(value, Buffer.from("hi", "utf8"));
  });

  it("rejects a key that is not stored", async () => {
    // Given an empty store
    const cf = cffCloudFrontModule(storeHolding({}));

    // When the Function reads a key that is not there
    const error = await assertThrowsErrorAsync(
      async () => await cf.kvs().get("missing"),
    );

    // Then the read rejects rather than throwing before the caller has a
    // promise, so a Function handling the miss with .catch() still works
    assertIdentical(error.name, "ResourceNotFoundException");
  });

  it("says whether a key exists without reading it", async () => {
    // Given a store with one key
    const cf = cffCloudFrontModule(storeHolding({ there: "yes" }));

    // When the Function checks both a stored and an absent key
    // Then exists answers without rejecting for the absent one
    assertTrue(await cf.kvs().exists("there"));
    assertFalse(await cf.kvs().exists("not-there"));
  });

  it("reports the store's metadata", async () => {
    // Given a store with two keys
    const store = storeHolding({ a: "1", b: "2" });
    const cf = cffCloudFrontModule(store);

    // When the Function reads the metadata
    const meta = await cf.kvs().meta();

    // Then it counts the keys and dates the store
    assertIdentical(meta.keyCount, 2);
    assertIdentical(meta.creationDateTime, store.createdTime.toISOString());
    assertIdentical(
      meta.lastUpdatedDateTime,
      store.lastModifiedTime.toISOString(),
    );
  });

  it("opens the associated store by its own ID or ARN", async () => {
    // Given a Function associated with a store
    const store = storeHolding({ k: "v" });
    const cf = cffCloudFrontModule(store);

    // When it names that store rather than leaving the call empty
    // Then both the ID and the ARN open it
    assertIdentical(await cf.kvs(store.id).get("k"), "v");
    assertIdentical(await cf.kvs(store.arn).get("k"), "v");
  });

  it("refuses to open a store the Function is not associated with", () => {
    // Given a Function associated with one store
    const cf = cffCloudFrontModule(storeHolding({ k: "v" }));

    // When it asks for a different one
    const error = assertThrowsError(() => cf.kvs("some-other-store"));

    // Then it is refused: a Function can only reach the store it names in its
    // own configuration
    assertIdentical(error.name, "CffKeyValueStoreUnavailable");
  });

  it("refuses to open anything when the Function has no association", () => {
    // Given a Function with no key value store association
    const cf = cffCloudFrontModule(undefined);

    // When it calls cf.kvs()
    const error = assertThrowsError(() => cf.kvs());

    // Then it is refused rather than handed an empty store, which would let a
    // Function that forgot its association quietly take every default
    assertIdentical(error.name, "CffKeyValueStoreUnavailable");
  });
});
