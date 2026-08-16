import { SimSesUnsupportedOperationException } from "../../error/sim-ses.error.js";
import type { SimSendEmailCommandInput } from "./send.command.js";

/**
 * Refuse the SendEmail inputs this simulation does not model.
 *
 * A configuration set is the exception: it names something this simulator does
 * not have, but naming it changes nothing about the message, and a recorded
 * send keeps the name so a test can still assert the right one was used. The
 * rest change where a message goes or what it reports, so accepting one and
 * dropping it would let a send behave differently in an account.
 */
export function refuseUnsimulatedSendInput(
  input: SimSendEmailCommandInput,
): void {
  if (input.FromEmailAddressIdentityArn !== undefined) {
    throw new SimSesUnsupportedOperationException(
      "Sending authorization is not simulated, so SendEmail refuses " +
        "FromEmailAddressIdentityArn rather than sending as an identity " +
        "whose policy it has not read",
    );
  }

  if (input.ListManagementOptions !== undefined) {
    throw new SimSesUnsupportedOperationException(
      "Contact lists are not simulated, so SendEmail refuses " +
        "ListManagementOptions rather than sending to a list it cannot read",
    );
  }

  if (input.EmailTags !== undefined) {
    throw new SimSesUnsupportedOperationException(
      "Message tags are not simulated, so SendEmail refuses EmailTags " +
        "rather than dropping the dimensions they would be reported under",
    );
  }
}
