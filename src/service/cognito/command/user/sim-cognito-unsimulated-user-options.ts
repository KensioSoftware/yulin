import { SimCognitoUnsimulatedInput } from "../sim-cognito-unsimulated-input.js";
import type { SimListUsersCommandInput } from "./list-users.command.js";
import type {
  SimAdminCreateUserCommandInput,
  SimAdminUpdateUserAttributesCommandInput,
} from "./user.command.js";

/**
 * Refuses the user operation inputs this simulation does not model.
 *
 * Nothing here delivers a message or verifies an attribute, so an input asking
 * for either is refused rather than dropped. The data a Lambda trigger reads is
 * refused only where the trigger that would read it is one this simulation does
 * not run.
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
   * `MessageAction: SUPPRESS` records no invitation, which is the difference
   * it makes on real Cognito too. `RESEND` is refused: it invites a user that
   * already exists, and `AdminCreateUser` refuses to create one twice here.
   *
   * `DesiredDeliveryMediums` is refused because the pool picks the medium from
   * the attributes the user has, and a request naming `SMS` for a user with an
   * email address would be recorded as an email.
   *
   * `ValidationData` and `ClientMetadata` are not refused. They exist to reach
   * the pre sign-up and custom message triggers, and both run here, so they
   * reach the handler.
   */
  refuseInCreate(input: SimAdminCreateUserCommandInput): void {
    this.creation.refuseUnless(
      "MessageAction",
      input.MessageAction,
      "SUPPRESS",
      "inviting a user that already exists",
    );
    this.creation.refuse(
      "DesiredDeliveryMediums",
      input.DesiredDeliveryMediums,
      "choosing which of a user's attributes the invitation goes to",
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
