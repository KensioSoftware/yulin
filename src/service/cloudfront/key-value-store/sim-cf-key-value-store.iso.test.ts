import {
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsError,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { makeSimAwsAccountId } from "../../aws/sim-aws-account.js";
import { SimCloudFrontKeyValueStore } from "./sim-cf-key-value-store.js";

describe("Sim CloudFront key value store", () => {
  it("has a global ARN with no Region, as CloudFront gives one", () => {
    // Given a store in a known Account
    const accountId = makeSimAwsAccountId();
    const store = new SimCloudFrontKeyValueStore({
      name: "redirects",
      accountId,
    });

    // When its ARN is read
    // Then the Region is empty, the way a Distribution and Function ARN are
    assertIdentical(
      store.arn,
      `arn:aws:cloudfront::${accountId}:key-value-store/${store.id}`,
    );
  });

  it("starts PROVISIONING and becomes READY", async () => {
    // Given a newly created store
    const store = new SimCloudFrontKeyValueStore({ name: "redirects" });
    assertIdentical(store.status, "PROVISIONING");

    // When provisioning finishes
    await store.ready();

    // Then it is servable
    assertIdentical(store.status, "READY");
  });

  it("takes its name and comment, and can change the comment", () => {
    // Given a store with a comment
    const store = new SimCloudFrontKeyValueStore({
      name: "redirects",
      comment: "first",
    });

    // When the comment is changed
    store.update({ comment: "second" });

    // Then the new comment is stored and the name is untouched
    assertIdentical(store.comment, "second");
    assertIdentical(store.name, "redirects");
  });

  it("keeps the comment when an update does not carry one", () => {
    // Given a store with a comment
    const store = new SimCloudFrontKeyValueStore({
      name: "redirects",
      comment: "kept",
    });

    // When it is updated with nothing to change
    store.update({});

    // Then the comment it had is still there
    assertIdentical(store.comment, "kept");
  });

  it("gives a new resource ETag when the configuration changes", () => {
    // Given a store
    const store = new SimCloudFrontKeyValueStore({ name: "redirects" });
    const before = store.resourceETag;

    // When its comment changes
    store.update({ comment: "changed" });

    // Then the resource ETag it had is no longer current, which is what makes
    // a stale CloudFront client write fail
    assertFalse(store.resourceETag === before);
  });

  it("keeps the two ETags apart, as AWS does", () => {
    // Given a store, and both of its ETags read
    const store = new SimCloudFrontKeyValueStore({ name: "redirects" });
    const resourceBefore = store.resourceETag;
    const dataBefore = store.dataETag;

    // Then they are different values to begin with
    assertFalse(resourceBefore === dataBefore);

    // When the keys change
    store.touchData();

    // Then only the data ETag moves, so a CloudFront client write that was
    // already holding the resource ETag is still good
    assertIdentical(store.resourceETag, resourceBefore);
    assertFalse(store.dataETag === dataBefore);

    // And when the configuration changes, only the resource ETag moves
    const dataAfterWrite = store.dataETag;
    store.touchResource();
    assertIdentical(store.dataETag, dataAfterWrite);
    assertFalse(store.resourceETag === resourceBefore);
  });

  it("refuses a write carrying an ETag that is not the current one", () => {
    // Given a store that has changed since a caller read both its ETags
    const store = new SimCloudFrontKeyValueStore({ name: "redirects" });
    const staleResource = store.resourceETag;
    const staleData = store.dataETag;
    store.touchResource();
    store.touchData();

    // When each write carries the ETag from before its change
    const resourceError = assertThrowsError(() => {
      store.assertResourceETag(staleResource);
    });
    const dataError = assertThrowsError(() => {
      store.assertDataETag(staleData);
    });

    // Then both are refused
    assertIdentical(resourceError.name, "PreconditionFailed");
    assertIdentical(dataError.name, "PreconditionFailed");
  });

  it("refuses a write carrying the other API's ETag", () => {
    // Given a store nothing has written to
    const store = new SimCloudFrontKeyValueStore({ name: "redirects" });

    // When a write reaches for the ETag belonging to the other client, which
    // is the mistake two separate ETags exist to catch
    const error = assertThrowsError(() => {
      store.assertDataETag(store.resourceETag);
    });

    // Then it is refused, and the message says which side it wanted
    assertIdentical(error.name, "PreconditionFailed");
    assertStringIncludes(error.message, "data ETag");
  });

  it("accepts a write carrying the current ETag", () => {
    // Given a store
    const store = new SimCloudFrontKeyValueStore({ name: "redirects" });

    // When each write carries the ETag its own side has now
    // Then neither is refused
    store.assertResourceETag(store.resourceETag);
    store.assertDataETag(store.dataETag);
  });

  it("was created when it was last modified, to begin with", () => {
    // Given a store created at a known time
    const lastModifiedTime = new Date("2026-01-01T00:00:00.000Z");
    const store = new SimCloudFrontKeyValueStore({
      name: "redirects",
      lastModifiedTime,
    });

    // When both times are read
    // Then they are the same, and a later change moves only one of them
    assertIdentical(store.createdTime, lastModifiedTime);

    store.touchData(new Date("2026-02-01T00:00:00.000Z"));

    assertIdentical(store.createdTime, lastModifiedTime);
    assertTrue(store.lastModifiedTime > store.createdTime);
  });

  it("lists the keys it holds", () => {
    // Given a store with a key
    const store = new SimCloudFrontKeyValueStore({ name: "redirects" });
    store.keys.put("/old", "/new");

    // When its keys are listed
    const listed = store.listKeys();

    // Then the key is there
    const [pair] = listed;
    assertNonNullable(pair);
    assertObjectEquals(pair, { Key: "/old", Value: "/new" });
  });
});
