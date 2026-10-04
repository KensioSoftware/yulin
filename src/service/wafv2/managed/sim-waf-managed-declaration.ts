import {
  type SimWafBotDeclaration,
  simWafBotDeclared,
} from "./sim-waf-bot-declaration.js";

/**
 * The managed rules a test says claim a request.
 */
export interface SimWafManagedMatchDeclaration {
  /** The rules that claim the request, by the name AWS gives them. */
  readonly matches?: readonly string[] | undefined;

  /**
   * The bot that sent the request, for Bot Control to match and label as it
   * would have identified it.
   */
  readonly bot?: SimWafBotDeclaration | undefined;
}

/**
 * What a test declared about the requests to one URI path.
 */
export interface SimWafDeclared {
  readonly matches: ReadonlySet<string>;
  readonly groupLabels: ReadonlyMap<string, readonly string[]>;
}

/**
 * What a request nothing was declared for carries.
 */
export const simWafNothingDeclared: SimWafDeclared = {
  matches: new Set(),
  groupLabels: new Map(),
};

/**
 * Read a declaration into the rules that match and the labels groups add.
 *
 * `ruleNamed` checks a rule name the declaration gives, and answers with the
 * name the rule goes by.
 */
export function simWafReadDeclaration(
  declaration: SimWafManagedMatchDeclaration,
  ruleNamed: (name: string) => string,
): SimWafDeclared {
  const bot =
    declaration.bot === undefined
      ? simWafNothingDeclared
      : simWafBotDeclared(declaration.bot);
  const named = (declaration.matches ?? []).map((name) => ruleNamed(name));

  return {
    matches: new Set([...named, ...bot.matches]),
    groupLabels: bot.groupLabels,
  };
}

/**
 * The labels one group adds to a request whatever its rules decide.
 */
export function simWafDeclaredGroupLabels(
  declared: SimWafDeclared,
  groupName: string,
): readonly string[] {
  return declared.groupLabels.get(groupName) ?? [];
}
