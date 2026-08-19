import type { SimRestApiIdentitySource } from "./identity/sim-rest-api-identity-source.js";
import {
  SimRestApiAuthorizer,
  type SimRestApiAuthorizerId,
  type SimRestApiAuthorizerView,
  simRestApiCognitoAuthType,
} from "./sim-rest-api-authorizer.js";
import type { SimRestApiUserPoolProviders } from "./sim-rest-api-user-pool-providers.js";

interface SimRestApiCognitoAuthorizerProperties {
  readonly authorizerId: SimRestApiAuthorizerId;
  readonly name: string;
  readonly providers: SimRestApiUserPoolProviders;
  readonly identitySource: SimRestApiIdentitySource;
}

/**
 * A simulated REST API `COGNITO_USER_POOLS` authorizer: the user pools whose
 * tokens a method admits.
 *
 * Nothing is invoked for a request. The authorizer verifies the token itself
 * against the keys the pools publish, which is why it names pools where a
 * Lambda authorizer names a function.
 *
 * What a token has to carry beyond a signature one of those pools made is the
 * method's business rather than this one's: the scopes a method asks for are
 * declared on the method, so one authorizer covers methods asking for
 * different scopes.
 */
export class SimRestApiCognitoAuthorizer extends SimRestApiAuthorizer {
  public readonly type = "COGNITO_USER_POOLS" as const;

  /**
   * The user pools this authorizer accepts tokens from, read from its
   * `providerARNs`.
   */
  public readonly providers: SimRestApiUserPoolProviders;

  /**
   * The header carrying the token, which is where the request is read from.
   * There is one, as there is for a `TOKEN` authorizer.
   */
  public readonly identitySource: SimRestApiIdentitySource;

  constructor(properties: SimRestApiCognitoAuthorizerProperties) {
    super(properties);
    this.providers = properties.providers;
    this.identitySource = properties.identitySource;
  }

  /**
   * Get the AWS-like view of this authorizer.
   */
  view(): SimRestApiAuthorizerView {
    return {
      id: this.authorizerId,
      name: this.name,
      type: this.type,
      authType: simRestApiCognitoAuthType,
      providerARNs: [...this.providers.arns],
      identitySource: this.identitySource.expression,
    };
  }
}
