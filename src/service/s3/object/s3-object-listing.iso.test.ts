import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  simS3DefaultMaxKeysPerPage,
  simS3EffectiveMaxKeys,
  simS3ObjectPage,
} from "./s3-object-listing.js";
import { SimS3Object } from "./s3-object.js";

function objectsWithKeys(...keys: readonly string[]): SimS3Object[] {
  return keys.map((key) => new SimS3Object({ key }));
}

function keysOf(objects: readonly SimS3Object[]): string[] {
  return objects.map((object) => object.key);
}

describe("simS3ObjectPage", () => {
  it("orders keys the way S3 does, whatever order storage held them in", () => {
    // Given Objects stored in no particular order, with mixed case.
    const objects = objectsWithKeys("beta.txt", "Alpha.txt", "alpha.txt");

    // When a page is taken.
    const page = simS3ObjectPage({ objects, maxKeys: 10 });

    // Then they come back in byte order, which puts an upper-case key before a
    // lower-case one rather than beside it.
    assertIdentical(
      keysOf(page.objects).join(","),
      "Alpha.txt,alpha.txt,beta.txt",
    );
    assertFalse(page.isTruncated);
  });

  it("stops at the page size and says the listing is truncated", () => {
    // Given more Objects than one page holds.
    const objects = objectsWithKeys("a.txt", "b.txt", "c.txt");

    // When a page of two is taken.
    const page = simS3ObjectPage({ objects, maxKeys: 2 });

    // Then the caller is told there is more, and where it stopped.
    assertIdentical(keysOf(page.objects).join(","), "a.txt,b.txt");
    assertTrue(page.isTruncated);
    assertIdentical(page.lastKey, "b.txt");
  });

  it("resumes strictly after the key it is given", () => {
    // Given a listing carrying on from the middle.
    const objects = objectsWithKeys("a.txt", "b.txt", "c.txt");

    // When the next page is taken.
    const page = simS3ObjectPage({ objects, startAfter: "b.txt", maxKeys: 10 });

    // Then the key resumed from is not repeated.
    assertIdentical(keysOf(page.objects).join(","), "c.txt");
    assertFalse(page.isTruncated);
    assertIdentical(page.lastKey, "c.txt");
  });

  it("resumes after a key the Bucket does not hold", () => {
    // Given a listing resuming after a key that has since been deleted, or was
    // never there, which is what a StartAfter a caller invented looks like.
    const objects = objectsWithKeys("a.txt", "b.txt", "c.txt");

    // When the page is taken.
    const page = simS3ObjectPage({ objects, startAfter: "b", maxKeys: 10 });

    // Then everything ordered after it comes back, rather than the listing
    // starting over from the beginning.
    assertIdentical(keysOf(page.objects).join(","), "b.txt,c.txt");
  });

  it("ends a listing that has run past the last key", () => {
    // Given a listing resuming after everything the Bucket holds.
    const objects = objectsWithKeys("a.txt", "b.txt");

    // When the page is taken.
    const page = simS3ObjectPage({ objects, startAfter: "z.txt", maxKeys: 10 });

    // Then it is empty and complete, with nothing to resume after.
    assertArrayLength(page.objects, 0);
    assertFalse(page.isTruncated);
    assertUndefined(page.lastKey);
  });

  it("returns nothing for a page with no room, without losing the rest", () => {
    // Given a caller asking for no keys at all.
    const objects = objectsWithKeys("a.txt", "b.txt");

    // When the page is taken.
    const page = simS3ObjectPage({ objects, maxKeys: 0 });

    // Then nothing comes back, and the listing is still truncated, because the
    // Bucket holds keys the caller has not been shown.
    assertArrayLength(page.objects, 0);
    assertTrue(page.isTruncated);
    assertUndefined(page.lastKey);
  });
});

describe("simS3EffectiveMaxKeys", () => {
  it("fills a page when the caller names no limit", () => {
    assertIdentical(simS3EffectiveMaxKeys(undefined, 1000), 1000);
  });

  it("honours a caller asking for fewer than a page holds", () => {
    assertIdentical(simS3EffectiveMaxKeys(5, 1000), 5);
  });

  it("caps a caller asking for more than a page holds", () => {
    // Real S3 treats MaxKeys as a request rather than an instruction, and never
    // answers with more than a page.
    assertIdentical(simS3EffectiveMaxKeys(5000, 1000), 1000);
  });

  it("uses the thousand keys real S3 fixes a page at", () => {
    assertIdentical(simS3DefaultMaxKeysPerPage, 1000);
  });
});
