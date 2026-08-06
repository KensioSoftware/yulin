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
    for (const [name, medium] of deliverableAttributes) {
      const value = user.attributeValues.get(name);

      if (value !== undefined && this.writable(pool, occasion, name)) {
        return new SimCognitoMessageDelivery(value, medium);
      }
    }

    return undefined;
  }

  private static writable(
    pool: SimCognitoUserPool,
    occasion: SimCognitoMessageOccasion,
    name: string,
  ): boolean {
    return (
      occasion === "AdminCreateUser" ||
      pool.settings.autoVerifiedAttributes.names.includes(name)
    );
  }
}
