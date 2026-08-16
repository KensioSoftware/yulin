import type { SimCognitoUserPool } from "../sim-cognito-user-pool.js";
import type { SimCognitoUser } from "../user/sim-cognito-user.js";
import type { SimCognitoMessageOccasion } from "./sim-cognito-message-occasion.js";
import type { SimCognitoMessageMedium } from "./sim-cognito-sent-message.js";

/**
 * The attributes a pool can write to, and the medium each one is reached by.
 *
 * The order is the order Cognito prefers: an email address is written to where
 * the user has one, and the phone number is what is left.
 */
const deliverableAttributes: readonly (readonly [
  string,
  SimCognitoMessageMedium,
])[] = [
  ["email", "EMAIL"],
  ["phone_number", "SMS"],
];

/**
 * Where a message would go, and how it would get there.
 *
 * Cognito picks both from the user's own attributes, so a user with an email
 * address gets an email and a user with only a phone number gets a text
 * message.
 */
export class SimCognitoMessageDelivery {
  public readonly recipient: string;
  public readonly medium: SimCognitoMessageMedium;

  private constructor(recipient: string, medium: SimCognitoMessageMedium) {
    this.recipient = recipient;
    this.medium = medium;
  }

  /**
   * Where a message for this occasion would go, or nothing where there is
   * nowhere to send it.
   *
   * A user with none of the attributes a pool can write to gets no message
   * rather than a refusal, because a pool with nowhere to write is not an
   * error: it is a pool that sends nothing, and the recorded messages say so
   * by being empty.
   *
   * A verification message goes only to an attribute the pool verifies
   * automatically, because that is the address it is trying to prove belongs
   * to the user. An invitation goes wherever the user can be reached.
   */
  static forOccasion(
    pool: SimCognitoUserPool,
    user: SimCognitoUser,
    occasion: SimCognitoMessageOccasion,
  ): SimCognitoMessageDelivery | undefined {
    for (const [name, medium] of this.attributesFor(occasion)) {
      const value = user.attributeValues.get(name);

      if (value !== undefined && this.writable(pool, occasion, name)) {
        return new SimCognitoMessageDelivery(value, medium);
      }
    }

    return undefined;
  }

  /**
   * The attributes this occasion could write to, in the order Cognito prefers
   * them.
   *
   * An MFA code goes to the user's phone number and nowhere else, because the
   * phone is the factor: a user with an email address as well is still
   * challenged by text message, where every other occasion would have written
   * to the address.
   */
  private static attributesFor(
    occasion: SimCognitoMessageOccasion,
  ): readonly (readonly [string, SimCognitoMessageMedium])[] {
    if (occasion === "Authentication") {
      return [["phone_number", "SMS"]];
    }

    return deliverableAttributes;
  }

  /**
   * A verification message goes only to an attribute the pool verifies
   * automatically, because that is the address it is trying to prove belongs
   * to the user. An invitation goes wherever the user can be reached, and so
   * does an MFA code: the user registered that phone number as its second
   * factor, whatever the pool verifies.
   */
  private static writable(
    pool: SimCognitoUserPool,
    occasion: SimCognitoMessageOccasion,
    name: string,
  ): boolean {
    return (
      occasion === "AdminCreateUser" ||
      occasion === "Authentication" ||
      pool.settings.autoVerifiedAttributes.names.includes(name)
    );
  }
}
