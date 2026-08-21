import { SimPersonalizeDeclarationError } from "../error/sim-personalize.error.js";

/**
 * Read the id a rule matches on, refusing one there is nothing to match.
 *
 * An empty id would match a request that named no item or no user at all,
 * which is the rule the default is already there for.
 */
export function requireSimPersonalizeRuleKey(
  key: string,
  description: string,
): string {
  if (key.length === 0) {
    throw new SimPersonalizeDeclarationError(
      `A simulated Personalize rule needs ${description} to match`,
    );
  }

  return key;
}
