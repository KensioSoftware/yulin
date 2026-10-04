import { SimWafDeclarationError } from "../error/sim-wafv2.error.js";
import {
  simWafBotCategories,
  simWafBotCategoryMatchingVerified,
  simWafBotControlRuleSet,
} from "./group/sim-waf-bot-control.js";

/**
 * The bot a test says sent a request, as Bot Control would identify it.
 */
export interface SimWafBotDeclaration {
  /**
   * The category, spelled as the `bot:category:` label spells it, such as
   * `search_engine` or `http_library`.
   */
  readonly category: string;

  /** The bot's name, as the `bot:name:` label spells it, such as `googlebot`. */
  readonly name?: string | undefined;

  /** The bot's publisher, as the `bot:organization:` label spells it. */
  readonly organization?: string | undefined;

  /**
   * Whether Bot Control could verify the bot. A verified bot is labelled and
   * left alone, and an unverified one matches its category's rule.
   */
  readonly verified?: boolean | undefined;
}

/**
 * What one declared bot adds to a request: the rules that match it, and the
 * labels the group adds whether or not a rule matches.
 */
export interface SimWafBotDeclared {
  readonly matches: readonly string[];
  readonly groupLabels: ReadonlyMap<string, readonly string[]>;
}

/**
 * Read a declared bot into the rule it matches and the labels it carries.
 *
 * A verified bot matches no rule, `CategoryAI` aside, which AWS applies to
 * verified bots too. Either way the group labels the bot's category, its name
 * and publisher where the declaration gives them, and whether it was verified.
 */
export function simWafBotDeclared(
  bot: SimWafBotDeclaration,
): SimWafBotDeclared {
  const rule = requiredCategoryRule(bot.category);
  const verified = bot.verified === true;
  const matches =
    !verified || bot.category === simWafBotCategoryMatchingVerified;

  return {
    matches: matches ? [rule] : [],
    groupLabels: new Map([
      [
        simWafBotControlRuleSet.name,
        [
          `bot:category:${bot.category}`,
          ...optionalLabel("bot:name", bot.name),
          ...optionalLabel("bot:organization", bot.organization),
          verified ? "bot:verified" : "bot:unverified",
        ],
      ],
    ]),
  };
}

/**
 * The rule for one category, refusing a category Bot Control does not name.
 */
function requiredCategoryRule(category: string): string {
  const rule = simWafBotCategories.get(category);

  if (rule === undefined) {
    throw new SimWafDeclarationError(
      `Bot Control names no bot category ${category}. The categories are ` +
        `${simWafBotCategories.keys().toArray().join(", ")}.`,
    );
  }

  return rule;
}

function optionalLabel(
  prefix: string,
  value: string | undefined,
): readonly string[] {
  return value === undefined ? [] : [`${prefix}:${value}`];
}
