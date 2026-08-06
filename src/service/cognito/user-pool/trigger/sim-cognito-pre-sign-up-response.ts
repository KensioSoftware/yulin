import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import type { SimCognitoUser } from "../user/sim-cognito-user.js";

/**
 * The three flags a `PreSignUp` handler can write into the event's response.
 *
 * They are read as `unknown` because a handler writes whatever it likes there.
 * Real Cognito treats anything but `true` as false rather than refusing the
 * response, and so does this.
 */
interface SimCognitoPreSignUpAnswer {
  readonly autoConfirmUser?: unknown;
  readonly autoVerifyEmail?: unknown;
  readonly autoVerifyPhone?: unknown;
}

/**
 * The response half of the event a handler returned, or nothing where it
 * returned no usable response.
 *
 * A handler that dropped the response, and a pool with no `PreSignUp` trigger
 * at all, both read as having asked for nothing.
 */
function answerOf(returned: unknown): SimCognitoPreSignUpAnswer {
  if (typeof returned !== "object" || returned === null) {
    return {};
  }

  const { response } = returned as { response?: unknown };

  if (typeof response !== "object" || response === null) {
    return {};
  }

  return response;
}

/**
 * What a `PreSignUp` handler asked for in the event it returned.
 *
 * These three are the whole of what the trigger can change: whether the new
 * user skips confirmation, and whether its email and phone number count as
 * verified without a code ever being answered.
 */
export class SimCognitoPreSignUpResponse {
  public readonly autoConfirmUser: boolean;
  public readonly autoVerifyEmail: boolean;
  public readonly autoVerifyPhone: boolean;

  constructor(returned: unknown) {
    const answer = answerOf(returned);

    this.autoConfirmUser = answer.autoConfirmUser === true;
    this.autoVerifyEmail = answer.autoVerifyEmail === true;
    this.autoVerifyPhone = answer.autoVerifyPhone === true;
  }

  /**
   * The attributes the handler asked to have marked verified.
   */
  get verifiedAttributeNames(): readonly string[] {
    const names: string[] = [];

    if (this.autoVerifyEmail) {
      names.push("email");
    }

    if (this.autoVerifyPhone) {
      names.push("phone_number");
    }

    return names;
  }

  /**
   * Mark the attributes the handler asked to verify on the new user.
   *
   * An attribute the sign-up did not carry is refused rather than skipped.
   * Real Cognito fails the sign-up in the same case, because there is no
   * address to call verified, and a user created here with the flag quietly
   * unset would be a user the deployed pool refused to create at all.
   */
  verifyAttributesOf(user: SimCognitoUser): void {
    for (const name of this.verifiedAttributeNames) {
      if (!user.attributeValues.has(name)) {
        throw new SimCognitoInvalidParameterException(
          `The PreSignUp trigger asked to verify '${name}', and the sign-up ` +
            `carried no '${name}' attribute to verify. Real Cognito refuses ` +
            `the sign-up in the same case.`,
        );
      }
    }

    user.verifyAttributes(this.verifiedAttributeNames);
  }
}
