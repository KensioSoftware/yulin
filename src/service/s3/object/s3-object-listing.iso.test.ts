import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
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
import { SimS3InvalidArgument } from "../error/sim-s3.error.js";

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
    assertIdentical(page.resumeAfter, "b.txt");
  });

  it("resumes strictly after the key it is given", () => {
    // Given a listing carrying on from the middle.
    const objects = objectsWithKeys("a.txt", "b.txt", "c.txt");

    // When the next page is taken.
    const page = simS3ObjectPage({ objects, startAfter: "b.txt", maxKeys: 10 });

    // Then the key resumed from is not repeated.
    assertIdentical(keysOf(page.objects).join(","), "c.txt");
    assertFalse(page.isTruncated);
    assertUndefined(page.resumeAfter);
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
    assertUndefined(page.resumeAfter);
  });

  it("completes a page with no room rather than offering nowhere to resume", () => {
    // Given a caller asking for no keys at all.
    const objects = objectsWithKeys("a.txt", "b.txt");

    // When the page is taken.
    const page = simS3ObjectPage({ objects, maxKeys: 0 });

    // Then nothing comes back, and the listing is complete rather than
    // truncated: a page that returned no keys has none to carry on after, so
    // calling it truncated would leave a caller looping on the same request.
    assertArrayLength(page.objects, 0);
    assertFalse(page.isTruncated);
    assertUndefined(page.resumeAfter);
  });

  it("takes no keys rather than keys off the end for a negative page size", () => {
    // Given a page size below zero, which slicing would read backwards.
    const objects = objectsWithKeys("a.txt", "b.txt", "c.txt");

    // When the page is taken.
    const page = simS3ObjectPage({ objects, maxKeys: -1 });

    // Then it holds nothing, rather than everything but the last key.
    assertArrayLength(page.objects, 0);
    assertFalse(page.isTruncated);
  });
});

describe("simS3ObjectPage under a delimiter", () => {
  it("rolls keys holding the delimiter up into a common prefix", () => {
    // Given a Bucket whose keys look like a folder tree.
    const objects = objectsWithKeys(
      "img/a.png",
      "img/b.png",
      "index.html",
      "js/app.js",
    );

    // When the top of the tree is listed.
    const page = simS3ObjectPage({ objects, delimiter: "/", maxKeys: 10 });

    // Then each folder comes back once, and only the key at the top of the
    // tree is listed as an Object.
    assertIdentical(page.commonPrefixes.join(","), "img/,js/");
    assertIdentical(keysOf(page.objects).join(","), "index.html");
    assertFalse(page.isTruncated);
  });

  it("orders a common prefix among the keys rather than after them", () => {
    // Given a folder whose name sorts in the middle of the keys beside it.
    const objects = objectsWithKeys("a.txt", "m/one.txt", "z.txt");
    const listing = { objects, delimiter: "/", maxKeys: 1 };

    // When the top of the tree is listed one entry at a time.
    const first = simS3ObjectPage(listing);
    const second = simS3ObjectPage({
      ...listing,
      startAfter: first.resumeAfter,
    });
    const third = simS3ObjectPage({
      ...listing,
      startAfter: second.resumeAfter,
    });

    // Then the folder arrives in key order, between the two Objects.
    assertIdentical(keysOf(first.objects).join(","), "a.txt");
    assertIdentical(second.commonPrefixes.join(","), "m/");
    assertIdentical(keysOf(third.objects).join(","), "z.txt");
    assertFalse(third.isTruncated);
  });

  it("counts a common prefix against the page size, as a key counts", () => {
    // Given two folders and a key, in a page with room for two entries.
    const objects = objectsWithKeys("img/a.png", "index.html", "js/app.js");

    // When the page is taken.
    const page = simS3ObjectPage({ objects, delimiter: "/", maxKeys: 2 });

    // Then the folder fills a place a key would have taken, and the listing is
    // truncated after it.
    assertIdentical(page.commonPrefixes.join(","), "img/");
    assertIdentical(keysOf(page.objects).join(","), "index.html");
    assertTrue(page.isTruncated);
    assertIdentical(page.resumeAfter, "index.html");
  });

  it("resumes after a common prefix by stepping over the whole folder", () => {
    // Given a page that ended on a folder holding more keys than it showed.
    const objects = objectsWithKeys("img/a.png", "img/b.png", "index.html");
    const first = simS3ObjectPage({ objects, delimiter: "/", maxKeys: 1 });

    assertIdentical(first.resumeAfter, "img/");

    // When the listing carries on from there.
    const second = simS3ObjectPage({
      objects,
      delimiter: "/",
      startAfter: first.resumeAfter,
      maxKeys: 10,
    });

    // Then the folder's own keys are behind the listing rather than rolled up
    // into the same folder again, which is what a marker compared against the
    // key would do.
    assertArrayLength(second.commonPrefixes, 0);
    assertIdentical(keysOf(second.objects).join(","), "index.html");
    assertFalse(second.isTruncated);
  });

  it("still rolls a folder up when resuming from a key inside it", () => {
    // Given a listing resuming after a key a caller picked itself, which sits
    // inside a folder rather than being a prefix a previous page ended on.
    const objects = objectsWithKeys("img/a.png", "img/b.png", "index.html");

    // When the page is taken.
    const page = simS3ObjectPage({
      objects,
      delimiter: "/",
      startAfter: "img/a.png",
      maxKeys: 10,
    });

    // Then the folder still covers what is left of it, rather than vanishing
    // because the folder's own name sorts before the key resumed from.
    assertIdentical(page.commonPrefixes.join(","), "img/");
    assertIdentical(keysOf(page.objects).join(","), "index.html");
  });

  it("rolls up beneath the prefix, past any delimiter inside it", () => {
    // Given a listing of one folder, whose own name holds the delimiter.
    const objects = objectsWithKeys(
      "img/icons/small.png",
      "img/icons/large.png",
      "img/logo.png",
    );

    // When that folder is listed.
    const page = simS3ObjectPage({
      objects,
      prefix: "img/",
      delimiter: "/",
      maxKeys: 10,
    });

    // Then the delimiter in the prefix is stepped over, and the folder inside
    // is the one rolled up.
    assertIdentical(page.commonPrefixes.join(","), "img/icons/");
    assertIdentical(keysOf(page.objects).join(","), "img/logo.png");
  });

  it("rolls up under a delimiter of any length", () => {
    // Given keys separated by something other than a slash.
    const objects = objectsWithKeys("2024--q1.csv", "2024--q2.csv", "notes.md");

    // When the Bucket is listed under that separator.
    const page = simS3ObjectPage({ objects, delimiter: "--", maxKeys: 10 });

    // Then the common prefix runs through the whole delimiter.
    assertIdentical(page.commonPrefixes.join(","), "2024--");
    assertIdentical(keysOf(page.objects).join(","), "notes.md");
  });

  it("lists flat for an empty delimiter, which appears in no key", () => {
    // Given a caller passing an empty delimiter.
    const objects = objectsWithKeys("img/a.png", "index.html");

    // When the Bucket is listed.
    const page = simS3ObjectPage({ objects, delimiter: "", maxKeys: 10 });

    // Then every key comes back, and nothing is rolled up.
    assertArrayLength(page.commonPrefixes, 0);
    assertIdentical(keysOf(page.objects).join(","), "img/a.png,index.html");
  });
});

describe("simS3EffectiveMaxKeys", () => {
  it("fills a page when the caller names no limit", () => {
    assertIdentical(simS3EffectiveMaxKeys(undefined, 1000), 1000);
  });

  it("honours a caller asking for fewer than a page holds", () => {
    assertIdentical(simS3EffectiveMaxKeys(5, 1000), 5);
  });

  it("refuses a negative number of keys", () => {
    // Real S3 refuses a negative MaxKeys rather than reading it as some number
    // of keys counted back from the end.
    const error = assertThrowsError(() => simS3EffectiveMaxKeys(-1, 1000));

    assertInstanceOf(error, SimS3InvalidArgument);
    assertStringIncludes(error.message, "-1");
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
