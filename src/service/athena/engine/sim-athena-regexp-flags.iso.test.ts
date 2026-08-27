import { assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import { anAnsweredExpression } from "./sim-athena-shim.fixture.js";

describe("the inline flags a Trino pattern is written with", () => {
  it("reads a flag group at the head of a pattern", async () => {
    // Given patterns carrying the flags Java writes inside them.
    // When each is matched.
    // Then the flag applies to the whole pattern, the way Joni reads it.
    assertIdentical(
      await anAnsweredExpression("regexp_like('BOT', '(?i)bot')"),
      1,
    );
    assertIdentical(
      await anAnsweredExpression("regexp_like('a CRAWLER', '(?i)bot|crawl')"),
      1,
      "the flag reaches past an alternation, since it is no group of its own",
    );
    assertIdentical(
      await anAnsweredExpression("regexp_like('a\nb', '(?s)a.b')"),
      1,
    );
    assertIdentical(
      await anAnsweredExpression("regexp_like('a\nBOT', '(?im)^bot')"),
      1,
      "two flags in one group",
    );
    assertIdentical(
      await anAnsweredExpression("regexp_like('a\nBOT', '(?i)(?m)^bot')"),
      1,
      "and two groups in a row",
    );
  });

  it("leaves the capture groups numbered as they were written", async () => {
    // Given a pattern whose flag group is followed by a capture group.
    // When the first group is extracted.
    // Then it is the pattern's own first group. A flag group captures nothing
    // in Java, so taking one off the front moves no number.
    assertIdentical(
      await anAnsweredExpression(
        String.raw`regexp_extract('Hello', '(?i)(h\w+)', 1)`,
      ),
      "Hello",
    );
  });

  it("reads a flag group through a replacement", async () => {
    // Given a pattern carrying a flag, used to replace rather than to match.
    // When every match is replaced.
    // Then the flag applied to all of them.
    assertIdentical(
      await anAnsweredExpression("regexp_replace('A1b2', '(?i)[ab]', 'x')"),
      "x1x2",
    );
  });

  it("runs the scoped form without touching it", async () => {
    // Given the scoped spelling, which JavaScript reads for itself.
    // When it is matched.
    // Then it answers, and nothing had to be lifted out of it.
    assertIdentical(
      await anAnsweredExpression("regexp_like('bot', '(?i:BOT)')"),
      1,
    );
  });

  it("turns down a flag it has no way to apply", async () => {
    // Given a flag JavaScript has not got, and one written part way through a
    // pattern rather than at its head.
    // When each is matched.
    // Then the answer is null, which leaves the declared result to answer.
    // JavaScript can turn no flag on from the middle of a pattern.
    assertIdentical(
      await anAnsweredExpression("regexp_like('ab', '(?x) a b')"),
      null,
    );
    assertIdentical(
      await anAnsweredExpression("regexp_like('botX', 'bot(?i)x')"),
      null,
    );
  });
});
