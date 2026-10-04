import { refuseSimWafRuleInput } from "../statement/sim-waf-rule-refusals.js";
import { simWafBotControlRuleSet } from "./group/sim-waf-bot-control.js";
import type { SimWafManagedRuleGroupDefinition } from "./sim-waf-managed-rule.type.js";

/**
 * The one `ManagedRuleGroupConfigs` entry this simulation evaluates, which
 * runs Bot Control at its common inspection level.
 */
interface SimWafBotControlConfigInput {
  readonly AWSManagedRulesBotControlRuleSet?:
    | { readonly InspectionLevel?: string | undefined }
    | undefined;
}

/**
 * Stop compiling a rule whose group configuration this simulation does not
 * evaluate, so the web ACL holds it unevaluated.
 *
 * Bot Control at `COMMON` is evaluated, with or without the configuration
 * that names the level. `TARGETED` is held, since its rules read tokens,
 * browser signals and traffic across requests. Every other configuration sets
 * up the account takeover and account creation groups, which are held too.
 */
export function refuseUnsimulatedSimWafGroupConfigs(
  configs: readonly unknown[] | undefined,
  group: SimWafManagedRuleGroupDefinition,
  ruleName: string,
): void {
  const written = configs ?? [];

  for (const config of written) {
    const level = botControlLevel(config);

    if (group !== simWafBotControlRuleSet || level === undefined) {
      refuseSimWafRuleInput(
        ruleName,
        "the rule group member ManagedRuleGroupConfigs",
        "it configures the account takeover and account creation groups, " +
          "and Bot Control's level, and an entry holding nothing but Bot " +
          "Control at COMMON is the one configuration simulated",
      );
    }

    if (level !== "COMMON") {
      refuseSimWafRuleInput(
        ruleName,
        `Bot Control at the ${level} inspection level`,
        "the targeted rules read tokens, browser signals and traffic across " +
          "requests, and COMMON is the level simulated",
      );
    }
  }
}

/**
 * The level one entry runs Bot Control at, when the entry is Bot Control's
 * configuration and nothing else.
 *
 * Anything else answers with no level, so a malformed entry or one carrying
 * another member beside Bot Control's is held rather than read as `COMMON`.
 */
function botControlLevel(config: unknown): string | undefined {
  const isBotControlAlone =
    typeof config === "object" &&
    config !== null &&
    Object.keys(config).join(",") === "AWSManagedRulesBotControlRuleSet";

  return isBotControlAlone
    ? (config as SimWafBotControlConfigInput).AWSManagedRulesBotControlRuleSet
        ?.InspectionLevel
    : undefined;
}
