import { SimCognitoUnsimulatedInput } from "../sim-cognito-unsimulated-input.js";
import type {
  SimAdminInitiateAuthCommandInput,
  SimAdminRespondToAuthChallengeCommandInput,
} from "./auth.command.js";

/**
 * Refuses the authentication inputs this simulation does not model.
 *
 * All of them change what real Cognito does with a sign-in, and none of them
 * can be honoured here, so a request carrying one is refused rather than
 * signed in as if it had not.
 */
export class SimCognitoUnsimulatedAuthOptions {
  private readonly initiation = new SimCognitoUnsimulatedInput(
    "AdminInitiateAuth",
  );
  private readonly response = new SimCognitoUnsimulatedInput(
    "AdminRespondToAuthChallenge",
  );

  /**
   * Refuse an `AdminInitiateAuth` request this simulation cannot honour.
   */
  refuseInInitiate(input: SimAdminInitiateAuthCommandInput): void {
    this.initiation.refuse(
      "ClientMetadata",
      input.ClientMetadata,
      "passing data to a Lambda trigger",
    );
    this.initiation.refuse(
      "AnalyticsMetadata",
      input.AnalyticsMetadata,
      "Pinpoint analytics",
    );
    this.initiation.refuse(
      "ContextData",
      input.ContextData,
      "threat protection, which reads the caller's device and address",
    );
    this.initiation.refuse(
      "Session",
      input.Session,
      "continuing a USER_AUTH flow that offered a choice of factors",
    );
  }

  /**
   * Refuse an `AdminRespondToAuthChallenge` request this simulation cannot
   * honour.
   */
  refuseInResponse(input: SimAdminRespondToAuthChallengeCommandInput): void {
    this.response.refuse(
      "ClientMetadata",
      input.ClientMetadata,
      "passing data to a Lambda trigger",
    );
    this.response.refuse(
      "AnalyticsMetadata",
      input.AnalyticsMetadata,
      "Pinpoint analytics",
    );
    this.response.refuse(
      "ContextData",
      input.ContextData,
      "threat protection, which reads the caller's device and address",
    );
  }
}
