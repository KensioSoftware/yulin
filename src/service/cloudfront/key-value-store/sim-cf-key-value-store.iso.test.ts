import {
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertObjectEquals,
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

  it("gives a new ETag on every change", () => {
    // Given a store with a comment
    const store = new SimCloudFrontKeyValueStore({ name: "redirects" });
    const before = store.eTag;

    // When it changes
    store.touch();

    // Then the ETag it had is no longer current, which is what makes a stale
    // write fail
    assertFalse(store.eTag === before);
  });

  it("refuses a write carrying an ETag that is not the current one", () => {
    // Given a store that has changed since a caller read its ETag
    const store = new SimCloudFrontKeyValueStore({ name: "redirects" });
    const stale = store.eTag;
    store.touch();

    // When a write carries the ETag from before the change
    const error = assertThrowsError(() => {
      store.assertETag(stale);
    });

    // Then it is refused
    assertIdentical(error.name, "PreconditionFailed");
  });

  it("accepts a write carrying the current ETag", () => {
    // Given a store
    const store = new SimCloudFrontKeyValueStore({ name: "redirects" });

    // When a write carries the ETag it has now
    // Then it is not refused
    store.assertETag(store.eTag);
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

    store.touch(new Date("2026-02-01T00:00:00.000Z"));

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
