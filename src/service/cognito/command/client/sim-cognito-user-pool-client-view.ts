import type { SimCognitoUserPoolClient } from "../../user-pool/client/sim-cognito-user-pool-client.js";
import type { SimCognitoUserPoolClientDescription } from "./list-user-pool-clients.command.js";
import type { SimCognitoUserPoolClientType } from "./user-pool-client.command.js";

/**
 * How a simulated app client is reported back to a caller.
 */
export class SimCognitoUserPoolClientView {
  /**
   * A client as `CreateUserPoolClient` and `DescribeUserPoolClient` report
   * it.
   *
   * The secret is included, as real Cognito includes it: `ClientSecret` on
   * `DescribeUserPoolClient` is how an application reads the secret it was
   * given, since nothing else ever shows it again.
   *
   * The two managed login settings the client accepted without acting on
   * are reported back as the request set them, and omitted where it set
   * neither.
   *
   * `AccessTokenValidity` and `IdTokenValidity` appear only when the request
   * set them, which is what real Cognito does. `RefreshTokenValidity` always
   * appears, defaulted to thirty days, and so does
   * `PreventUserExistenceErrors`, defaulted to `LEGACY`.
   */
  describe(client: SimCognitoUserPoolClient): SimCognitoUserPoolClientType {
    const { tokenValidity } = client;

    return {
      ClientId: client.id,
      ClientName: client.name,
      UserPoolId: client.userPoolId,
      ClientSecret: client.secret,
      ExplicitAuthFlows: client.explicitAuthFlows.values,
      PreventUserExistenceErrors: client.preventUserExistenceErrors.value,
      AccessTokenValidity: tokenValidity.accessToken.validity,
      IdTokenValidity: tokenValidity.idToken.validity,
      RefreshTokenValidity: tokenValidity.refreshToken.validity,
      TokenValidityUnits: tokenValidity.unitsOutput(),
      CreationDate: client.creationDate,
      LastModifiedDate: client.lastModifiedDate,
      ...client.unsimulatedSettings.toOutput(),
    };
  }

  /**
   * A client as `ListUserPoolClients` reports it, which carries no secret and
   * no settings.
   */
  listEntry(
    client: SimCognitoUserPoolClient,
  ): SimCognitoUserPoolClientDescription {
    return {
      ClientId: client.id,
      ClientName: client.name,
      UserPoolId: client.userPoolId,
    };
  }
}
