import { simCognitoUserPoolRegionName } from "../sim-cognito-user-pool-id.js";
import type { SimCognitoTriggerContext } from "./sim-cognito-trigger-context.js";
import type { SimCognitoTriggerName } from "./sim-cognito-trigger-name.js";
import type { SimCognitoTriggerOccasion } from "./sim-cognito-trigger-occasion.js";
import { SimCognitoTriggerRequest } from "./sim-cognito-trigger-request.js";

/**
 * The SDK version real Cognito reports for a caller it could not identify,
 * which is what an SDK v3 client gets.
 *
 * Every invocation here reports this, because nothing in a simulated request
 * says which SDK made it. A handler branching on it would branch the same way
 * against a real pool called from the JavaScript SDK, and differently from one
 * called by an older SDK that does announce itself.
 */
const awsSdkVersion = "aws-sdk-unknown-unknown";

/**
 * The client id real Cognito reports for an operation no app client made.
 *
 * `AdminCreateUser` and `AdminConfirmSignUp` are called with AWS credentials
 * rather than through an app client, so there is no client id to report.
 */
const adminCallerClientId = "CLIENT_ID_NOT_APPLICABLE";

/**
 * The event document a simulated Cognito Lambda trigger is invoked with.
 *
 * The shape is the real one, down to the `response` a handler is expected to
 * hand back with its answer written into it. Only `PreSignUp` is asked
 * anything, so it is the only one whose response arrives with fields already
 * in it, which is how real Cognito sends it.
 */
export class SimCognitoTriggerEvent {
  private readonly context: SimCognitoTriggerContext;

  constructor(context: SimCognitoTriggerContext) {
    this.context = context;
  }

  /**
   * The response half of the event, as real Cognito sends it.
   *
   * A `PreSignUp` handler is sent the three flags it can answer with, already
   * set to false, so a handler reading one before writing it finds what it
   * would find against a real pool.
   */
  private static response(trigger: SimCognitoTriggerName): object {
    if (trigger !== "PreSignUp") {
      return {};
    }

    return {
      autoConfirmUser: false,
      autoVerifyEmail: false,
      autoVerifyPhone: false,
    };
  }

  /**
   * The event for one occasion.
   */
  document(occasion: SimCognitoTriggerOccasion): object {
    return {
      version: "1",
      region: simCognitoUserPoolRegionName(this.context.pool.id),
      userPoolId: this.context.pool.id,
      userName: this.context.user.username,
      callerContext: {
        awsSdkVersion,
        clientId: this.context.client?.id ?? adminCallerClientId,
      },
      triggerSource: occasion.source,
      request: new SimCognitoTriggerRequest(this.context).document(occasion),
      response: SimCognitoTriggerEvent.response(occasion.trigger),
    };
  }
}
