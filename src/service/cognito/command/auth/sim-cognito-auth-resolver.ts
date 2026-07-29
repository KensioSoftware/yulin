import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { requireSimCognitoSecretHash } from "../../user-pool/auth/sim-cognito-secret-hash.js";
import type { SimCognitoUserPoolClient } from "../../user-pool/client/sim-cognito-user-pool-client.js";
import { requireSimCognitoUserPoolClientId } from "../../user-pool/client/sim-cognito-user-pool-client-id.js";
import type { SimCognitoUserPool } from "../../user-pool/sim-cognito-user-pool.js";
import type { SimCognitoRequestResolver } from "../sim-cognito-request-resolver.js";
import type { SimCognitoAuthParameters } from "./sim-cognito-auth-parameters.js";

interface SimCognitoAuthResolverProperties {
  readonly resolver: SimCognitoRequestResolver;
}

interface SimCognitoCommandOptions {
  readonly caller?: SimAwsCaller;
}

interface SimCognitoAuthRequestInput {
  readonly UserPoolId?: string | undefined;
  readonly ClientId?: string | undefined;
}

/**
 * The pool an authentication request runs against, and the app client it runs
 * through.
 */
export interface SimCognitoAuthenticatingClient {
  readonly pool: SimCognitoUserPool;
  readonly client: SimCognitoUserPoolClient;
}

/**
 * Resolves what an authentication request names before the flow itself runs.
 *
 * Both authentication commands start the same way, and both end up needing the
 * same three things: the pool, the app client, and a username whose
 * `SECRET_HASH` has been checked.
 */
export class SimCognitoAuthResolver {
  private readonly resolver: SimCognitoRequestResolver;

  constructor(properties: SimCognitoAuthResolverProperties) {
    this.resolver = properties.resolver;
  }

  /**
   * Resolve the pool and app client, once the caller may reach the pool.
   *
   * An app client has no ARN of its own, so authorization is against the
   * pool's, as it is everywhere else in this simulation.
   */
  poolClient(
    action: string,
    input: SimCognitoAuthRequestInput,
    options: SimCognitoCommandOptions | undefined,
  ): SimCognitoAuthenticatingClient {
    const pool = this.resolver.pool(action, input.UserPoolId, options);

    return {
      pool,
      client: pool.requireClient(
        requireSimCognitoUserPoolClientId(input.ClientId),
      ),
    };
  }

  /**
   * Read the username a request names, with its `SECRET_HASH` checked.
   *
   * The hash covers the username, so it can only be checked once the username
   * is known, and it is checked before anything looks the user up.
   */
  username(
    client: SimCognitoUserPoolClient,
    parameters: SimCognitoAuthParameters,
  ): string {
    const username = parameters.require("USERNAME");

    requireSimCognitoSecretHash(
      username,
      client,
      parameters.find("SECRET_HASH"),
    );

    return username;
  }
}
