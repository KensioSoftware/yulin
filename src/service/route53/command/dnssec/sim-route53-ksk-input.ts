import { SimRoute53InvalidInput } from "../../error/sim-route53.error.js";
import { SimRoute53KeySigningKeyStatus } from "../../dnssec/sim-route53-key-signing-key.js";

/**
 * The two fields a key-signing key request carries beyond its hosted zone.
 *
 * Route53 requires both rather than defaulting either: a name is what
 * identifies the key within its zone, and a key created active starts being
 * published straight away, so neither is a choice to make on the caller's
 * behalf.
 */
export class SimRoute53KskInput {
  /**
   * The name identifying a key-signing key within its hosted zone.
   */
  requireName(name: string | undefined): string {
    if (name === undefined || name.length === 0) {
      throw new SimRoute53InvalidInput(
        "A key signing key Name is required, and identifies the key within its hosted zone",
      );
    }

    return name;
  }

  /**
   * The status a new key-signing key starts in.
   */
  requireStatus(status: string | undefined): SimRoute53KeySigningKeyStatus {
    if (status === SimRoute53KeySigningKeyStatus.Active) {
      return SimRoute53KeySigningKeyStatus.Active;
    }

    if (status === SimRoute53KeySigningKeyStatus.Inactive) {
      return SimRoute53KeySigningKeyStatus.Inactive;
    }

    throw new SimRoute53InvalidInput(
      `A key signing key Status of '${String(status)}' is not valid: use ${SimRoute53KeySigningKeyStatus.Active} or ${SimRoute53KeySigningKeyStatus.Inactive}`,
    );
  }
}
