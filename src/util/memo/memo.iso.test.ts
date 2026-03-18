import { describe, it } from "vitest";
import { Memo } from "./memo.js";
import { assertIdentical } from "@kensio/smartass";

describe("Memo", () => {
  it("creates and caches values", () => {
    const memo = new Memo<string>();
    let callCount = 0;

    const value1 = memo.getOrCreate("key1", () => {
      callCount++;
      return "value1";
    });
    const value2 = memo.getOrCreate("key1", () => {
      callCount++;
      return "different";
    });

    assertIdentical(value1, "value1");
    assertIdentical(value2, "value1");
    assertIdentical(callCount, 1);
  });

  it("handles multiple keys independently", () => {
    const memo = new Memo<number>();

    const a = memo.getOrCreate("a", () => 10);
    const b = memo.getOrCreate("b", () => 20);
    const c = memo.getOrCreate("a", () => 99);

    assertIdentical(a, 10);
    assertIdentical(b, 20);
    assertIdentical(c, 10);
  });

  it("checks key existence", () => {
    const memo = new Memo<string>();

    assertIdentical(memo.has("key"), false);
    memo.getOrCreate("key", () => "value");
    assertIdentical(memo.has("key"), true);
  });
});
