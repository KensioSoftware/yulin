import {
  assertArrayEmpty,
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertThrowsError,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimCloudFrontKeyValueStoreKeys } from "./sim-cf-key-value-store-keys.js";

describe("Sim CloudFront key value store keys", () => {
  it("reads back a key that was written", () => {
    // Given a store with a key written to it
    const keys = new SimCloudFrontKeyValueStoreKeys();
    keys.put("/old", "/new");

    // When the key is read
    // Then the value written is the value read
    assertIdentical(keys.get("/old"), "/new");
    assertTrue(keys.has("/old"));
  });

  it("replaces the value already under a key", () => {
    // Given a key that has been written twice
    const keys = new SimCloudFrontKeyValueStoreKeys();
    keys.put("flag", "off");
    keys.put("flag", "on");

    // When the key is read
    // Then the second write is what is there, and it is still one key
    assertIdentical(keys.get("flag"), "on");
    assertIdentical(keys.itemCount, 1);
  });

  it("refuses a key that was never written", () => {
    // Given an empty store
    const keys = new SimCloudFrontKeyValueStoreKeys();

    // When a key that is not there is read
    // Then it is refused, as the data API refuses one
    const error = assertThrowsError(() => keys.get("missing"));
    assertIdentical(error.name, "ResourceNotFoundException");
    assertFalse(keys.has("missing"));
  });

  it("forgets a deleted key, and is untroubled by deleting twice", () => {
    // Given a store with one key
    const keys = new SimCloudFrontKeyValueStoreKeys();
    keys.put("gone", "value");

    // When the key is deleted twice
    keys.delete("gone");
    keys.delete("gone");

    // Then it is gone, and the second delete was not an error: DeleteKey is
    // idempotent in the data API
    assertFalse(keys.has("gone"));
    assertIdentical(keys.itemCount, 0);
  });

  it("lists every key and value in the order they were written", () => {
    // Given a store with three keys
    const keys = new SimCloudFrontKeyValueStoreKeys();
    keys.put("a", "1");
    keys.put("b", "2");
    keys.put("c", "3");

    // When the keys are listed
    const listed = keys.list();

    // Then all three are there, in the order they arrived
    assertArrayLength(listed, 3);
    assertIdentical(listed[0].Key, "a");
    assertIdentical(listed[2].Value, "3");
  });

  it("counts the bytes of both the keys and the values", () => {
    // Given a store holding one two-byte key and one three-byte value
    const keys = new SimCloudFrontKeyValueStoreKeys();
    keys.put("ab", "cde");

    // When the size is read
    // Then the key counts towards it as well as the value
    assertIdentical(keys.totalSizeInBytes, 5);
  });

  it("counts a multi-byte character as its bytes, not its length", () => {
    // Given a value holding a character outside ASCII
    const keys = new SimCloudFrontKeyValueStoreKeys();
    keys.put("k", "é");

    // When the size is read
    // Then the two bytes of the character are counted, which is what the
    // store's size quota is measured in
    assertIdentical(keys.totalSizeInBytes, 3);
  });

  it("has nothing in it to begin with", () => {
    // Given a new store
    const keys = new SimCloudFrontKeyValueStoreKeys();

    // When its size is read
    // Then it is empty
    assertIdentical(keys.itemCount, 0);
    assertIdentical(keys.totalSizeInBytes, 0);
    assertArrayEmpty(keys.list());
  });
});
