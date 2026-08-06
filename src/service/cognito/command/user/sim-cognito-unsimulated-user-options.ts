import { SimCognitoUnsimulatedInput } from "../sim-cognito-unsimulated-input.js";
import type { SimListUsersCommandInput } from "./list-users.command.js";
import type {
  SimAdminCreateUserCommandInput,
  SimAdminUpdateUserAttributesCommandInput,
} from "./user.command.js";

/**
 * Refuses the user operation inputs this simulation does not model.
 *
 * Nothing here delivers a message, verifies an attribute or runs a Lambda
 * trigger, so an input asking for any of those is refused rather than dropped.
 */
export class SimCognitoUnsimulatedUserOptions {
  private readonly creation = new SimCognitoUnsimulatedInput("AdminCreateUser");
  private readonly attributeUpdate = new SimCognitoUnsimulatedInput(
    "AdminUpdateUserAttributes",
  );
  private readonly listing = new SimCognitoUnsimulatedInput("ListUsers");

  /**
   * Refuse an `AdminCreateUser` request this simulation cannot honour.
   *
   * `MessageAction: SUPPRESS` is allowed, and does nothing, because no
   * invitation is ever sent here. `RESEND` is refused: there is no message to
   * send again.
   *
   * `ValidationData` and `ClientMetadata` are not refused. Both exist to reach
   * the pre sign-up trigger, and that trigger runs here, so they reach the
   * handler.
   */
  refuseInCreate(input: SimAdminCreateUserCommandInput): void {
    this.creation.refuseUnless(
      "MessageAction",
      input.MessageAction,
      "SUPPRESS",
      "sending the invitation message again",
    );
    this.creation.refuse(
      "DesiredDeliveryMediums",
      input.DesiredDeliveryMediums,
      "emailing or texting the user their temporary password",
    );
    this.creation.refuse(
      "ForceAliasCreation",
      input.ForceAliasCreation,
      "moving an email or phone number alias to the new user",
    );
  }

  /**
   * Refuse an `AdminUpdateUserAttributes` request this simulation cannot
   * honour.
   */
  refuseInUpdate(input: SimAdminUpdateUserAttributesCommandInput): void {
    this.attributeUpdate.refuse(
      "ClientMetadata",
      input.ClientMetadata,
      "passing data to a Lambda trigger",
    );
  }

  /**
   * Refuse a `ListUsers` request this simulation cannot honour.
   *
   * A `Filter` is refused rather than ignored because a dropped filter answers
   * with the wrong users rather than with an error, which is the kind of pass
   * that turns into a failure in a deployment.
   */
  refuseInList(input: SimListUsersCommandInput): void {
    this.listing.refuse(
      "Filter",
      input.Filter,
      "narrowing the listing to the users matching an attribute",
    );
    this.listing.refuse(
      "AttributesToGet",
      input.AttributesToGet,
      "returning only some of each user's attributes",
    );
  }
}
