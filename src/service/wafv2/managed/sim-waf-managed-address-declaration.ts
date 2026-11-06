import { SimWafDeclarationError } from "../error/sim-wafv2.error.js";
import { SimWafDeclaredAddressRange } from "./sim-waf-managed-address-range.js";
import type { SimWafDeclared } from "./sim-waf-managed-declaration.js";
import {
  requiredSimWafManagedRule,
  type SimWafManagedRuleEntry,
} from "./sim-waf-managed-rule-groups.js";

/**
 * The managed rules a test says flag the requests from some addresses.
 */
export interface SimWafManagedAddressDeclaration {
  /**
   * The rules that flag the addresses, by the name AWS gives them, such as
   * `AnonymousIPList` or `HostingProviderIPList`.
   */
  readonly matches: readonly string[];
}

/**
 * The address ranges a test declared, each with the rules that flag a request
 * from inside it.
 *
 * Declaring the same range again replaces what it was declared with, and a
 * request from inside two declared ranges is flagged by the rules of both.
 */
export class SimWafDeclaredAddresses {
  readonly #byRange = new Map<string, SimWafDeclaredAddressRange>();

  /**
   * Declare the rules that flag the requests from one address or CIDR range.
   *
   * Each rule is checked to be one that decides by the client address.
   */
  declare(range: string, ruleNames: readonly string[]): void {
    const matches = new Set(
      ruleNames.map((name) =>
        simWafAddressRuleName(requiredSimWafManagedRule(name)),
      ),
    );

    this.#byRange.set(
      range.trim(),
      SimWafDeclaredAddressRange.read(range, matches),
    );
  }

  /**
   * What was declared for a request's path, joined with what was declared
   * for the address it came from.
   */
  joinedWith(declared: SimWafDeclared, sourceIp: string): SimWafDeclared {
    const byAddress = this.#byRange
      .values()
      .filter((range) => range.holds(sourceIp))
      .flatMap((range) => range.matches)
      .toArray();

    if (byAddress.length === 0) {
      return declared;
    }

    return {
      matches: new Set([...declared.matches, ...byAddress]),
      groupLabels: declared.groupLabels,
    };
  }
}

/**
 * The name of a rule a test may declare by address, refusing one whose group
 * reads the request rather than where it came from.
 */
function simWafAddressRuleName(entry: SimWafManagedRuleEntry): string {
  if (entry.group.readsSourceAddress !== true) {
    throw new SimWafDeclarationError(
      `${entry.rule.name} belongs to ${entry.group.name}, which does not ` +
        `decide by the client address, so a match for it is declared by path ` +
        `with managedRules().onRequest rather than by address.`,
    );
  }

  return entry.rule.name;
}
