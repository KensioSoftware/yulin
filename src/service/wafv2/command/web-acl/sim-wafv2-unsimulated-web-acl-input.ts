import type { SimWafUnsimulatedPart } from "../../resource/sim-waf-unsimulated-part.js";
import type { SimWafWebAclWriteInput } from "./web-acl.command.js";

const tokenActions =
  "the CAPTCHA and Challenge actions are answered by a browser, and nothing " +
  "in a test does that";

/**
 * Why each web ACL member this simulation does not model is held and not
 * acted on, by the name a request and a template both write.
 */
const unsimulatedMembers: ReadonlyMap<string, string> = new Map([
  ["CaptchaConfig", tokenActions],
  ["ChallengeConfig", tokenActions],
  ["TokenDomains", tokenActions],
  [
    "DataProtectionConfig",
    "it decides what a request field looks like in logs, and web ACL logging " +
      "is not simulated",
  ],
  [
    "OnSourceDDoSProtectionConfig",
    "it responds to traffic volume, which a simulated request never has",
  ],
  [
    "ApplicationConfig",
    "it configures the WAF-hosted sign-in pages, which are not simulated",
  ],
]);

/**
 * The web ACL members a write carries that this simulation holds without
 * acting on, keyed by member name.
 *
 * Each of them changes what a web ACL does on real WAF. The web ACL keeps
 * them, `GetWebACL` returns them as written, and `unsimulatedSimWafWebAclMembers`
 * says which ones a request evaluated here goes without.
 */
export function heldSimWafWebAclMembers(
  input: SimWafWebAclWriteInput,
): Readonly<Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(input).filter(
      ([member, value]) =>
        unsimulatedMembers.has(member) && value !== undefined,
    ),
  );
}

/**
 * What a web ACL's held members leave out, one part per member.
 */
export function unsimulatedSimWafWebAclMembers(
  members: Readonly<Record<string, unknown>>,
): readonly SimWafUnsimulatedPart[] {
  return unsimulatedMembers
    .entries()
    .filter(([member]) => Object.hasOwn(members, member))
    .map(([member, reason]) => ({
      part: member,
      reason: `${member} is not simulated: ${reason}`,
    }))
    .toArray();
}
