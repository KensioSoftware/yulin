import { SimSesUnsupportedOperationException } from "../../error/sim-ses.error.js";
import type { SimCreateEmailIdentityCommandInput } from "./identity.command.js";

/**
 * Refuse the CreateEmailIdentity inputs this simulation does not model.
 *
 * Each changes what the identity does on real SES, so accepting one and
 * dropping it would let a request succeed here and behave differently in an
 * account. DKIM signing attributes are the clearest case: an identity created
 * with Bring Your Own DKIM would look configured to the request that made it
 * and unconfigured to everything else.
 */
export function refuseUnsimulatedIdentityInput(
  input: SimCreateEmailIdentityCommandInput,
): void {
  if (input.Tags !== undefined) {
    throw new SimSesUnsupportedOperationException(
      "Email identity tags are not simulated, so CreateEmailIdentity " +
        "refuses them rather than dropping them",
    );
  }

  if (input.DkimSigningAttributes !== undefined) {
    throw new SimSesUnsupportedOperationException(
      "DKIM signing is not simulated, so CreateEmailIdentity refuses " +
        "DkimSigningAttributes rather than reporting a signing configuration " +
        "no message here is signed with",
    );
  }

  if (input.ConfigurationSetName !== undefined) {
    throw new SimSesUnsupportedOperationException(
      "Configuration sets are not simulated, so CreateEmailIdentity refuses " +
        "ConfigurationSetName rather than naming one that does nothing",
    );
  }
}
