import { SimCognitoUnsimulatedInput } from "../sim-cognito-unsimulated-input.js";
import type {
  SimAdminInitiateAuthCommandInput,
  SimAdminRespondToAuthChallengeCommandInput,
  SimInitiateAuthCommandInput,
  SimRespondToAuthChallengeCommandInput,
} from "./auth.command.js";

/**
 * What every authentication request can carry and this simulation cannot
 * honour.
 */
interface SimCognitoUnsimulatedAuthInput {
  readonly ClientMetadata?: Readonly<Record<string, string>> | undefined;
  readonly AnalyticsMetadata?: object | undefined;
}

/**
 * Refuses the authentication inputs this simulation does not model.
 *
 * All of them change what real Cognito does with a sign-in, and none of them
 * can be honoured here, so a request carrying one is refused rather than
 * signed in as if it had not.
 *
 * The admin operations and the client ones name the caller's device and
 * address differently, `ContextData` against `UserContextData`, so each
 * refusal names the input the caller actually wrote.
 */
export class SimCognitoUnsimulatedAuthOptions {
  private readonly adminInitiation = new SimCognitoUnsimulatedInput(
    "AdminInitiateAuth",
  );
  private readonly adminResponse = new SimCognitoUnsimulatedInput(
    "AdminRespondToAuthChallenge",
  );
  private readonly initiation = new SimCognitoUnsimulatedInput("InitiateAuth");
  private readonly response = new SimCognitoUnsimulatedInput(
    "RespondToAuthChallenge",
  );

  private static refuseShared(
    unsimulated: SimCognitoUnsimulatedInput,
    input: SimCognitoUnsimulatedAuthInput,
  ): void {
    unsimulated.refuse(
      "ClientMetadata",
      input.ClientMetadata,
      "passing data to a Lambda trigger",
    );
    unsimulated.refuse(
      "AnalyticsMetadata",
      input.AnalyticsMetadata,
      "Pinpoint analytics",
    );
  }

  /**
   * Refuse an `AdminInitiateAuth` request this simulation cannot honour.
   */
  refuseInAdminInitiate(input: SimAdminInitiateAuthCommandInput): void {
    SimCognitoUnsimulatedAuthOptions.refuseShared(this.adminInitiation, input);
    this.adminInitiation.refuse(
      "ContextData",
      input.ContextData,
      "threat protection, which reads the caller's device and address",
    );
    this.adminInitiation.refuse(
      "Session",
      input.Session,
      "continuing a USER_AUTH flow that offered a choice of factors",
    );
  }

  /**
   * Refuse an `AdminRespondToAuthChallenge` request this simulation cannot
   * honour.
   */
  refuseInAdminResponse(
    input: SimAdminRespondToAuthChallengeCommandInput,
  ): void {
    SimCognitoUnsimulatedAuthOptions.refuseShared(this.adminResponse, input);
    this.adminResponse.refuse(
      "ContextData",
      input.ContextData,
      "threat protection, which reads the caller's device and address",
    );
  }

  /**
   * Refuse an `InitiateAuth` request this simulation cannot honour.
   */
  refuseInInitiate(input: SimInitiateAuthCommandInput): void {
    SimCognitoUnsimulatedAuthOptions.refuseShared(this.initiation, input);
    this.initiation.refuse(
      "UserContextData",
      input.UserContextData,
      "threat protection, which reads the caller's device and address",
    );
    this.initiation.refuse(
      "Session",
      input.Session,
      "signing in directly from ConfirmSignUp",
    );
  }

  /**
   * Refuse a `RespondToAuthChallenge` request this simulation cannot honour.
   */
  refuseInResponse(input: SimRespondToAuthChallengeCommandInput): void {
    SimCognitoUnsimulatedAuthOptions.refuseShared(this.response, input);
    this.response.refuse(
      "UserContextData",
      input.UserContextData,
      "threat protection, which reads the caller's device and address",
    );
  }
}
