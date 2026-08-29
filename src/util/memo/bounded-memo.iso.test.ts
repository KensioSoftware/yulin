import { assertFalse, assertIdentical, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";
import { BoundedMemo } from "./bounded-memo.js";

describe("Bounded memo", () => {
  it("creates a value once and hands the same one back", () => {
    // Given a memo with room to spare.
    const memo = new BoundedMemo<string>(10);
    let callCount = 0;

    // When the same key is asked for twice.
    const first = memo.getOrCreate("key", () => {
      callCount++;
      return "created";
    });
    const second = memo.getOrCreate("key", () => {
      callCount++;
      return "created again";
    });

    // Then the second answer is the first one, made once.
    assertIdentical(first, "created");
    assertIdentical(second, "created");
    assertIdentical(callCount, 1);
  });

  it("keeps its keys apart", () => {
    // Given a memo holding two keys.
    const memo = new BoundedMemo<number>(10);
    memo.getOrCreate("a", () => 10);
    memo.getOrCreate("b", () => 20);

    // When each is read back.
    // Then each answers with its own value.
    assertIdentical(
      memo.getOrCreate("a", () => 99),
      10,
    );
    assertIdentical(
      memo.getOrCreate("b", () => 99),
      20,
    );
    assertTrue(memo.has("a"));
    assertFalse(memo.has("c"));
  });

  it("drops what was cached first once it is full", () => {
    // Given a memo holding two values, filled to its limit.
    const memo = new BoundedMemo<string>(2);
    memo.getOrCreate("first", () => "one");
    memo.getOrCreate("second", () => "two");

    // When a third value arrives.
    memo.getOrCreate("third", () => "three");

    // Then the oldest of them has gone and the rest are still there.
    assertFalse(memo.has("first"));
    assertTrue(memo.has("second"));
    assertTrue(memo.has("third"));
  });

  it("makes an evicted value again when it is next asked for", () => {
    // Given a memo that has dropped a value to stay within its limit.
    const memo = new BoundedMemo<string>(1);
    let callCount = 0;
    memo.getOrCreate("key", () => {
      callCount++;
      return "value";
    });
    memo.getOrCreate("other", () => "other value");

    // When the dropped key is asked for again.
    const value = memo.getOrCreate("key", () => {
      callCount++;
      return "value";
    });

    // Then it is made a second time, and the caller cannot tell.
    assertIdentical(value, "value");
    assertIdentical(callCount, 2);
  });
});
