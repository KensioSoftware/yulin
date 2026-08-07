import { assertArrayLength, assertArrayMinLength } from "@kensio/smartass";
import { smartassPreferSpecificAssertions } from "@kensio/smartass/eslint";
import { ESLint } from "eslint";
import { describe, it } from "vitest";

/**
 * The `no-restricted-syntax` entries this repository's config resolves to for
 * one of its own files.
 *
 * Reading them back through ESLint rather than from the config module is the
 * point: what matters is what survives every config in the chain, not what any
 * one of them asked for.
 */
async function resolvedSelectors(filePath: string): Promise<readonly string[]> {
  const config = await new ESLint().calculateConfigForFile(filePath);
  const entry = config.rules?.["no-restricted-syntax"];

  if (!Array.isArray(entry) || entry[0] === "off" || entry[0] === 0) {
    return [];
  }

  return entry
    .slice(1)
    .map((restriction: unknown) =>
      typeof restriction === "string"
        ? restriction
        : ((restriction as { selector?: string }).selector ?? ""),
    );
}

/** Every selector smartass's shared config asks for. */
function smartassSelectors(): readonly string[] {
  return smartassPreferSpecificAssertions.flatMap((config) => {
    const entry = (config as { rules?: Record<string, unknown> }).rules?.[
      "no-restricted-syntax"
    ];

    return Array.isArray(entry)
      ? entry
          .slice(1)
          .map(
            (restriction: unknown) =>
              (restriction as { selector?: string }).selector ?? "",
          )
      : [];
  });
}

describe("Resolving this repository's own no-restricted-syntax rule", () => {
  it("keeps the restrictions this repository sets on itself", async () => {
    // Given the config as it resolves for an ordinary source file
    const selectors = await resolvedSelectors("src/index.ts");

    // When this repository's own restrictions are looked for
    const ownRestriction = selectors.filter((selector) =>
      selector.includes("[property.name='props']"),
    );

    // Then they are still there. Flat config replaces a rule's configuration
    // rather than merging it, so a shared config setting this same rule can
    // drop these without a word, and one did for 265 commits.
    assertArrayMinLength(ownRestriction, 1);
  });

  it("keeps every selector the shared assertion config brings", async () => {
    // Given the same resolved config, and what smartass asked for
    const selectors = new Set(await resolvedSelectors("src/index.ts"));
    const wanted = smartassSelectors();

    // When each of smartass's selectors is looked for in it
    const missing = wanted.filter((selector) => !selectors.has(selector));

    // Then none of them was lost on the way through the config chain
    assertArrayLength(missing, 0);
    assertArrayMinLength(wanted, 1);
  });

  it("applies the same restrictions to test files", async () => {
    // Given the config as it resolves for a test file
    const forSource = await resolvedSelectors("src/index.ts");
    const forTest = await resolvedSelectors("src/index.iso.test.ts");

    // When the two are compared
    // Then a test file is held to the same restrictions, which is where the
    // assertion advice is worth the most
    assertArrayLength(forTest, forSource.length);
  });
});
