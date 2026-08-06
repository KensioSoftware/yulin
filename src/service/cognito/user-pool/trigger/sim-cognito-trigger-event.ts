import type { SimCognitoUserPoolClient } from "../client/sim-cognito-user-pool-client.js";
import type { SimCognitoUserPool } from "../sim-cognito-user-pool.js";
import { simCognitoUserPoolRegionName } from "../sim-cognito-user-pool-id.js";
import type { SimCognitoUser } from "../user/sim-cognito-user.js";
import {
  simCognitoTriggerSource,
  type SimCognitoTriggerName,
} from "./sim-cognito-trigger-name.js";

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
 * The sign-in a trigger is firing for.
 */
export interface SimCognitoTriggerContext {
  readonly pool: SimCognitoUserPool;
  readonly client: SimCognitoUserPoolClient;
  readonly user: SimCognitoUser;
  readonly clientMetadata?: Readonly<Record<string, string>> | undefined;
}

/**
 * The event document a simulated Cognito Lambda trigger is invoked with.
 *
 * The shape is the real one, down to the empty `response` a handler is
 * expected to hand back untouched. Neither of these two triggers reads anything
 * out of `response`, so what a handler writes there is ignored, exactly as real
 * Cognito ignores it.
 */
export class SimCognitoTriggerEvent {
  private readonly context: SimCognitoTriggerContext;

  constructor(context: SimCognitoTriggerContext) {
    this.context = context;
  }

  /**
   * The event for one trigger.
   *
   * The two triggers name the same data differently, which is not a detail to
   * smooth over: a `PreAuthentication` handler reads `request.validationData`
   * and a `PostAuthentication` one reads `request.clientMetadata`, and both
   * come from the `ClientMetadata` the sign-in request carried.
   */
  document(trigger: SimCognitoTriggerName): object {
    return {
      version: "1",
      region: simCognitoUserPoolRegionName(this.context.pool.id),
      userPoolId: this.context.pool.id,
      userName: this.context.user.username,
      callerContext: {
        awsSdkVersion,
        clientId: this.context.client.id,
      },
      triggerSource: simCognitoTriggerSource(trigger),
      request: this.request(trigger),
      response: {},
    };
  }

  private request(trigger: SimCognitoTriggerName): object {
    if (trigger === "PreAuthentication") {
      return {
        userAttributes: this.userAttributes(),
        ...(this.context.clientMetadata !== undefined && {
          validationData: { ...this.context.clientMetadata },
        }),
        // A sign-in naming a user the pool does not hold is refused before any
        // trigger runs here, so the trigger only ever sees a user that exists.
        // Real Cognito fires it with `userNotFound: true` for an app client
        // that hides user existence, which this simulation does not do.
        userNotFound: false,
      };
    }

    return {
      userAttributes: this.userAttributes(),
      // Devices are not remembered here: `CreateUserPool` refuses a
      // `DeviceConfiguration`, so no sign-in is ever made from a new device.
      newDeviceUsed: false,
      ...(this.context.clientMetadata !== undefined && {
        clientMetadata: { ...this.context.clientMetadata },
      }),
    };
  }

  /**
   * The user's attributes by name, as a trigger event carries them.
   *
   * The event is a plain object of strings rather than the `Name`/`Value` pairs
   * the API answers with, and `sub` is among them.
   */
  private userAttributes(): Record<string, string> {
    return {
      sub: this.context.user.sub,
      ...Object.fromEntries(this.context.user.attributeValues),
    };
  }
}
