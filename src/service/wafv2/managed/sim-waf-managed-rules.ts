import { SimWafDeclarationError } from "../error/sim-wafv2.error.js";
import type { SimWafInspectedRequest } from "../evaluate/sim-waf-inspected-request.js";
import { requiredSimWafManagedRule } from "./sim-waf-managed-rule-groups.js";
import {
  type SimWafManagedRuleReport,
  simWafManagedRuleReports,
} from "./sim-waf-managed-rule-report.js";

import type { SimWafManagedRuleTier } from "./sim-waf-managed-rule.type.js";
import {
  type SimWafManagedAddressDeclaration,
  SimWafDeclaredAddresses,
} from "./sim-waf-managed-address-declaration.js";
import {
  type SimWafDeclared,
  type SimWafManagedMatchDeclaration,
  simWafNothingDeclared,
  simWafReadDeclaration,
} from "./sim-waf-managed-declaration.js";

export type {
  SimWafDeclared,
  SimWafManagedMatchDeclaration,
} from "./sim-waf-managed-declaration.js";
export type { SimWafManagedAddressDeclaration } from "./sim-waf-managed-address-declaration.js";

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
 * Bot Control is declared by the bot rather than the rule, since a verified
 * bot is labelled and matches no rule:
 *
 * ```typescript
 * simAws.wafV2().managedRules().onRequest("/search", {
 *   bot: { category: "search_engine", name: "googlebot", verified: true },
 * });
 * ```
 *
 * The IP reputation and anonymous IP groups decide by the client address, so
 * their matches can be declared by address instead, for a request that states
 * where it came from with the `x-sim-aws-source-ip` header:
 *
 * ```typescript
 * simAws.wafV2().managedRules().onAddress("185.220.101.0/24", {
 *   matches: ["AnonymousIPList"],
 * });
 * ```
 *
 * A declared match is a match, and everything after it is what the group would
 * have done anyway: the rule adds its label, an action override applies to it,
 * and the group blocks by that rule.
 */
export class SimWafManagedRules {
  readonly #byUriPath = new Map<string, SimWafDeclared>();
  readonly #byAddress = new SimWafDeclaredAddresses();

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
      simWafReadDeclaration(
        declaration,
        (name) => requiredSimWafManagedRule(name).rule.name,
      ),
    );
  }

  /**
   * Declare which managed rules flag the requests from one address or one
   * CIDR range of addresses.
   *
   * Only the rules of a group that decides by the client address can be
   * declared this way, which is the IP reputation list and the anonymous IP
   * list. A request states its address with the `x-sim-aws-source-ip` header,
   * and one that states none comes from `127.0.0.1`.
   *
   * Declaring the same range again replaces it.
   */
  onAddress(range: string, declaration: SimWafManagedAddressDeclaration): void {
    this.#byAddress.declare(range, declaration.matches);
  }

  /**
   * What a test declared about one request: the rules that claim it, and the
   * labels a group adds to it whatever its rules decide.
   *
   * A request is claimed by what was declared for its path and for its
   * address together.
   */
  declared(request: SimWafInspectedRequest): SimWafDeclared {
    return this.#byAddress.joinedWith(
      this.#byUriPath.get(request.uriPath) ?? simWafNothingDeclared,
      request.sourceIp,
    );
  }

  /**
   * What this simulation covers of one managed rule.
   */
  tierOf(ruleName: string): SimWafManagedRuleTier {
    return requiredSimWafManagedRule(ruleName).rule.tier;
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
}
