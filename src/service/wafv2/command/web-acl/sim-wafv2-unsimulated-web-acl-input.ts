import { SimWafUnsimulatedInputException } from "../../error/sim-wafv2.error.js";
import { refuseSimWafTags } from "../sim-wafv2-input.js";
import type { SimWafWebAclWriteInput } from "./web-acl.command.js";

/**
 * One web ACL member real WAFv2 takes and this simulation does not.
 */
type SimWafRefusedMember = readonly [
  read: (input: SimWafWebAclWriteInput) => unknown,
  member: string,
  reason: string,
];

const tokenActions =
  "the CAPTCHA and Challenge actions are answered by a browser, and nothing " +
  "in a test does that";

const refusedMembers: readonly SimWafRefusedMember[] = [
  [(input): unknown => input.CaptchaConfig, "CaptchaConfig", tokenActions],
  [(input): unknown => input.ChallengeConfig, "ChallengeConfig", tokenActions],
  [(input): unknown => input.TokenDomains, "TokenDomains", tokenActions],
  [
    (input): unknown => input.AssociationConfig,
    "AssociationConfig",
    "it sets the body size a web ACL inspects for the resources it is " +
      "associated with, and nothing is associated with a web ACL yet",
  ],
  [
    (input): unknown => input.DataProtectionConfig,
    "DataProtectionConfig",
    "it decides what a request field looks like in logs, and web ACL logging " +
      "is not simulated",
  ],
  [
    (input): unknown => input.OnSourceDDoSProtectionConfig,
    "OnSourceDDoSProtectionConfig",
    "it responds to traffic volume, which a simulated request never has",
  ],
  [
    (input): unknown => input.ApplicationConfig,
    "ApplicationConfig",
    "it configures the WAF-hosted sign-in pages, which are not simulated",
  ],
];

/**
 * Refuse the web ACL members this simulation does not model.
 *
 * Each of them changes what a web ACL does on real WAF, so accepting one and
 * dropping it would leave the web ACL looking configured to the request that
 * wrote it and unconfigured to every request it then evaluated.
 */
export function refuseUnsimulatedSimWafWebAclInput(
  input: SimWafWebAclWriteInput,
  operation: string,
): void {
  refuseSimWafTags(input.Tags, operation);

  for (const [read, member, reason] of refusedMembers) {
    if (read(input) !== undefined) {
      throw new SimWafUnsimulatedInputException(
        `${operation} refuses ${member}, which Yulin does not simulate: ${
          reason
        }`,
      );
    }
  }
}
