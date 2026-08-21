import { SimSesBadRequestException } from "../error/sim-ses.error.js";
import {
  isSimSesIdentityName,
  simSesIdentityType,
} from "../identity/sim-ses-identity-name.js";

/**
 * Read the address a suppression command names, refusing one SES would refuse.
 *
 * A suppression list holds addresses. A domain is a valid identity and not a
 * valid entry here, so it is refused rather than kept as an address nothing
 * would ever match.
 */
export function requiredSimSesSuppressionAddress(
  emailAddress?: string,
): string {
  if (emailAddress === undefined || emailAddress.length === 0) {
    throw new SimSesBadRequestException(
      "1 validation error detected: Value at 'emailAddress' failed to " +
        "satisfy constraint: Member must not be null",
    );
  }

  if (
    !isSimSesIdentityName(emailAddress) ||
    simSesIdentityType(emailAddress) !== "EMAIL_ADDRESS"
  ) {
    throw new SimSesBadRequestException(
      `Invalid email address: ${emailAddress}.`,
    );
  }

  return emailAddress;
}
