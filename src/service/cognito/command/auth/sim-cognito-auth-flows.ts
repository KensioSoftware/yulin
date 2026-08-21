import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import { SimCognitoAuthFlow } from "./sim-cognito-auth-flow.js";

/**
 * Server-side sign-in with a username and password, through the admin API.
 */
export const adminUserPasswordFlow = new SimCognitoAuthFlow({
  name: "ADMIN_USER_PASSWORD_AUTH",
  clientSetting: "ALLOW_ADMIN_USER_PASSWORD_AUTH",
  legacySettings: ["ADMIN_NO_SRP_AUTH"],
});

/**
 * Client-side sign-in with a username and password.
 *
 * The legacy `USER_PASSWORD_AUTH` setting is the same name as the flow, which
 * is why an app client can hold it as an `ExplicitAuthFlows` value.
 */
export const userPasswordFlow = new SimCognitoAuthFlow({
  name: "USER_PASSWORD_AUTH",
  clientSetting: "ALLOW_USER_PASSWORD_AUTH",
  legacySettings: ["USER_PASSWORD_AUTH"],
});

/**
 * Exchanging a refresh token for a new access and id token.
 *
 * `REFRESH_TOKEN` is the same flow under its other name, and real Cognito
 * accepts either.
 */
export const refreshTokenFlow = new SimCognitoAuthFlow({
  name: "REFRESH_TOKEN_AUTH",
  clientSetting: "ALLOW_REFRESH_TOKEN_AUTH",
  aliases: ["REFRESH_TOKEN"],
  exchangesRefreshToken: true,
});

/**
 * Choice-based sign-in, where the pool offers the factors it allows first and
 * the user presents one of them.
 *
 * This is the flow a passkey is presented through. It runs on both entry
 * points, as it does on real Cognito.
 */
export const userAuthFlow = new SimCognitoAuthFlow({
  name: "USER_AUTH",
  clientSetting: "ALLOW_USER_AUTH",
  offersChoice: true,
});

/**
 * The flows one entry point into authentication runs.
 *
 * `InitiateAuth` and `AdminInitiateAuth` do not run the same set, as real
 * Cognito does not: `ADMIN_USER_PASSWORD_AUTH` is not valid for `InitiateAuth`,
 * and `USER_PASSWORD_AUTH` is the client-side flow that replaces it.
 */
export class SimCognitoAuthFlows {
  private readonly operation: string;
  private readonly flows: readonly SimCognitoAuthFlow[];

  constructor(operation: string, flows: readonly SimCognitoAuthFlow[]) {
    this.operation = operation;
    this.flows = flows;
  }

  /**
   * Resolve the flow a request asked for, or refuse.
   *
   * A flow this simulation does not run is refused rather than treated as one
   * it does, because which flow ran decides what the caller has to send and
   * what it gets back.
   */
  require(authFlow: string | undefined): SimCognitoAuthFlow {
    const flow = this.flows.find((candidate) =>
      candidate.matches(String(authFlow)),
    );

    if (flow !== undefined) {
      return flow;
    }

    throw new SimCognitoInvalidParameterException(
      `AuthFlow '${String(authFlow)}' is not simulated: ${this.operation} ` +
        `here runs ${this.flows.map((each) => each.name).join(" and ")}. SRP ` +
        `and custom authentication are not implemented.`,
    );
  }
}

/**
 * The flows `AdminInitiateAuth` runs.
 */
export const adminAuthFlows = new SimCognitoAuthFlows("AdminInitiateAuth", [
  adminUserPasswordFlow,
  refreshTokenFlow,
  userAuthFlow,
]);

/**
 * The flows `InitiateAuth` runs.
 */
export const clientAuthFlows = new SimCognitoAuthFlows("InitiateAuth", [
  userPasswordFlow,
  refreshTokenFlow,
  userAuthFlow,
]);
