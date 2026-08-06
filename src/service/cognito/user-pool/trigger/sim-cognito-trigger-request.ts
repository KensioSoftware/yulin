import type { SimCognitoTriggerContext } from "./sim-cognito-trigger-context.js";
import type { SimCognitoTriggerName } from "./sim-cognito-trigger-name.js";

/**
 * The `request` half of the event one trigger is given.
 *
 * Each trigger reads its own set of fields, and two of them name the same data
 * differently, which is not a detail to smooth over: a `PreAuthentication`
 * handler reads `request.validationData` where a `PostAuthentication` one reads
 * `request.clientMetadata`, and both come from the `ClientMetadata` the sign-in
 * carried.
 */
export class SimCognitoTriggerRequest {
  private readonly context: SimCognitoTriggerContext;

  constructor(context: SimCognitoTriggerContext) {
    this.context = context;
  }

  /**
   * The request for one trigger.
   */
  document(trigger: SimCognitoTriggerName): object {
    switch (trigger) {
      case "PreSignUp": {
        return this.preSignUp();
      }
      case "PostConfirmation": {
        return this.postConfirmation();
      }
      case "PreAuthentication": {
        return this.preAuthentication();
      }
      case "PostAuthentication": {
        return this.postAuthentication();
      }
      case "PreTokenGeneration": {
        return this.preTokenGeneration();
      }
    }
  }

  /**
   * What a `PreTokenGeneration` handler is given.
   *
   * `groupConfiguration.groupsToOverride` is the user's groups in precedence
   * order, which is what a handler copies back into `groupOverrideDetails` to
   * leave the `cognito:groups` claim alone. The `iamRolesToOverride` and
   * `preferredRole` real Cognito sends beside it are left out, because the
   * claims they feed are not issued here and a response naming them is refused.
   *
   * The client metadata is there only where the occasion carried it, which is a
   * challenge response and nothing else: real Cognito does not pass an
   * `InitiateAuth` request's `ClientMetadata` on to this trigger.
   */
  private preTokenGeneration(): object {
    const { pool, user } = this.context;

    return {
      userAttributes: this.userAttributes(),
      groupConfiguration: {
        groupsToOverride: pool
          .groupsOf(user.username)
          .map((group) => group.name),
      },
      ...this.clientMetadata(),
    };
  }

  /**
   * What a `PreSignUp` handler is given.
   *
   * The attributes carry no `sub`, because the user does not exist yet: real
   * Cognito allocates one only once the sign-up has got past this handler. A
   * handler keying an external record on `sub` has to do it in
   * `PostConfirmation` instead, here as there.
   */
  private preSignUp(): object {
    return {
      userAttributes: Object.fromEntries(this.context.user.attributeValues),
      ...this.validationData(),
      ...this.clientMetadata(),
    };
  }

  /**
   * What a `PostConfirmation` handler is given, which is the confirmed user's
   * attributes with the `sub` Cognito allocated among them.
   */
  private postConfirmation(): object {
    return { userAttributes: this.userAttributes(), ...this.clientMetadata() };
  }

  private preAuthentication(): object {
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

  private postAuthentication(): object {
    return {
      userAttributes: this.userAttributes(),
      // Devices are not remembered here: `CreateUserPool` refuses a
      // `DeviceConfiguration`, so no sign-in is ever made from a new device.
      newDeviceUsed: false,
      ...this.clientMetadata(),
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

  private clientMetadata(): object {
    if (this.context.clientMetadata === undefined) {
      return {};
    }

    return { clientMetadata: { ...this.context.clientMetadata } };
  }

  private validationData(): object {
    if (this.context.validationData === undefined) {
      return {};
    }

    return { validationData: { ...this.context.validationData } };
  }
}
