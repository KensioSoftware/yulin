import { assertFalse, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";
import { simIamWildcardMatch } from "./sim-iam-wildcard.js";

const caseSensitive = { caseSensitive: true };
const caseInsensitive = { caseSensitive: false };

describe("Sim IAM wildcard matching", () => {
  it("matches any run of characters with an asterisk", () => {
    // Given a pattern standing for a whole service.
    const pattern = "s3:*";

    // When actions of that service are matched against it.
    // Then the asterisk covers all of them, and nothing outside the service.
    assertTrue(simIamWildcardMatch(pattern, "s3:GetObject", caseSensitive));
    assertTrue(simIamWildcardMatch(pattern, "s3:", caseSensitive));
    assertFalse(
      simIamWildcardMatch(pattern, "s3control:GetObject", caseSensitive),
    );
  });

  it("matches exactly one character with a question mark", () => {
    // Given a pattern with a question mark where a digit belongs.
    const pattern = "eu-west-?";

    // When Region names are matched against it.
    // Then one character fits and two do not.
    assertTrue(simIamWildcardMatch(pattern, "eu-west-1", caseSensitive));
    assertFalse(simIamWildcardMatch(pattern, "eu-west-", caseSensitive));
    assertFalse(simIamWildcardMatch(pattern, "eu-west-12", caseSensitive));
  });

  it("treats every other regular expression character as itself", () => {
    // Given a pattern made of characters a regular expression would read as
    // syntax.
    const pattern = "a.b+c(d)[e]{f}|g^h$i";

    // When the pattern's own text is matched against it.
    // Then it matches itself and not what those characters would have meant.
    assertTrue(simIamWildcardMatch(pattern, pattern, caseSensitive));
    assertFalse(
      simIamWildcardMatch(pattern, "axb+c(d)[e]{f}|g^h$i", caseSensitive),
    );
    assertFalse(simIamWildcardMatch("a.c", "abc", caseSensitive));
  });

  it("anchors a pattern to the whole value", () => {
    // Given a pattern with no wildcard in it.
    const pattern = "s3:GetObject";

    // When a longer value containing it is matched.
    // Then the surrounding characters keep it out.
    assertTrue(simIamWildcardMatch(pattern, "s3:GetObject", caseSensitive));
    assertFalse(
      simIamWildcardMatch(pattern, "s3:GetObjectVersion", caseSensitive),
    );
    assertFalse(simIamWildcardMatch(pattern, "xs3:GetObject", caseSensitive));
  });

  it("answers each call site by the case sensitivity it asked for", () => {
    // Given one pattern differing from a value only by case.
    const pattern = "s3:getobject";

    // When the same pattern is matched both ways, in both orders.
    // Then each call site gets its own answer, whichever ran first.
    assertFalse(simIamWildcardMatch(pattern, "s3:GetObject", caseSensitive));
    assertTrue(simIamWildcardMatch(pattern, "s3:GetObject", caseInsensitive));
    assertFalse(simIamWildcardMatch(pattern, "s3:GetObject", caseSensitive));
  });

  it("gives a repeated match the same answer as the first one", () => {
    // Given a pattern matched once already.
    const pattern = "arn:aws:s3:::example-*";
    assertTrue(
      simIamWildcardMatch(
        pattern,
        "arn:aws:s3:::example-reports",
        caseSensitive,
      ),
    );

    // When it is used again, for a value it matches and one it does not.
    // Then it answers both as it would have on a first compilation.
    assertTrue(
      simIamWildcardMatch(pattern, "arn:aws:s3:::example-logs", caseSensitive),
    );
    assertFalse(
      simIamWildcardMatch(pattern, "arn:aws:s3:::other-logs", caseSensitive),
    );
  });
});
