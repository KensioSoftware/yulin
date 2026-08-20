import { SimWafDeclarationError } from "../error/sim-wafv2.error.js";
import type { SimWafInspectedRequest } from "../evaluate/sim-waf-inspected-request.js";
import {
  findSimWafManagedRule,
  type SimWafManagedRuleEntry,
} from "./sim-waf-managed-rule-groups.js";
import {
  type SimWafManagedRuleReport,
  simWafManagedRuleReports,
} from "./sim-waf-managed-rule-report.js";

import type { SimWafManagedRuleTier } from "./sim-waf-managed-rule.type.js";

/**
 * The managed rules a test says claim a request.
 */
export interface SimWafManagedMatchDeclaration {
  /** The rules that claim the request, by the name AWS gives them. */
  readonly matches: readonly string[];
}

const noMatches: ReadonlySet<string> = new Set();

/**
 * The managed rule matches this simulated WAFv2 answers with, and what it
 * covers of each rule.
 *
 * Most of the managed rules detect for themselves, and this is for the ones
 * that cannot. The four `CrossSiteScripting_*` rules run detection AWS
 * documents none of, and the rules in the documented tier match the published
 * patterns and nothing beyond them, so a test asserting that a payload is
 * blocked says which rule claims it:
 *
 * ```typescript
 * simAws.wafV2().managedRules().onRequest("/search", {
 *   matches: ["CrossSiteScripting_QueryArguments"],
 * });
 * ```
 *
 * A declared match is a match, and everything after it is what the group would
 * have done anyway: the rule adds its label, an action override applies to it,
 * and the group blocks by that rule.
 */
export class SimWafManagedRules {
  readonly #byUriPath = new Map<string, ReadonlySet<string>>();

  /**
   * Declare which managed rules claim a request to one URI path.
   *
   * The path is matched exactly, as simulated Rekognition matches the name of
   * an image a result was declared for. A rule name no simulated group carries
   * is refused here rather than matching nothing later.
   */
  onRequest(uriPath: string, declaration: SimWafManagedMatchDeclaration): void {
    if (uriPath === "") {
      throw new SimWafDeclarationError(
        "A declared managed rule match needs the URI path of the request it " +
          "is declared for",
      );
    }

    this.#byUriPath.set(
      uriPath,
      new Set(
        declaration.matches.map((name) => this.requiredRule(name).rule.name),
      ),
    );
  }

  /**
   * The rules declared to claim one request.
   */
  declaredMatches(request: SimWafInspectedRequest): ReadonlySet<string> {
    return this.#byUriPath.get(request.uriPath) ?? noMatches;
  }

  /**
   * What this simulation covers of one managed rule.
   */
  tierOf(ruleName: string): SimWafManagedRuleTier {
    return this.requiredRule(ruleName).rule.tier;
  }

  /**
   * What this simulation covers of every managed rule it carries.
   *
   * This is how a reader finds out what a group does here without reading the
   * source of it, which matters most for the rules that detect less than the
   * AWS rule they stand for.
   */
  rules(): readonly SimWafManagedRuleReport[] {
    return simWafManagedRuleReports();
  }

  private requiredRule(ruleName: string): SimWafManagedRuleEntry {
    const entry = findSimWafManagedRule(ruleName);

    if (entry === undefined) {
      throw new SimWafDeclarationError(
        `No simulated AWS managed rule group holds a rule named ` +
          `${ruleName}. The rules that are simulated are reported by ` +
          `managedRules().rules().`,
      );
    }

    return entry;
  }
}
