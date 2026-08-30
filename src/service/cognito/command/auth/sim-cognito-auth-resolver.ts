import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { requireSimCognitoSecretHash } from "../../user-pool/auth/sim-cognito-secret-hash.js";
import type { SimCognitoUserPoolClient } from "../../user-pool/client/sim-cognito-user-pool-client.js";
import { requireSimCognitoUserPoolClientId } from "../../user-pool/client/sim-cognito-user-pool-client-id.js";
import type {
  SimCognitoClientInPool,
  SimCognitoUserPoolStore,
} from "../../user-pool/sim-cognito-user-pool-store.js";
import { simCognitoInvalidClientDimension } from "../../metric/sim-cognito-metrics.js";
import type { SimCognitoPoolMetrics } from "../../metric/sim-cognito-pool-metrics.js";
import type { SimCognitoRequestResolver } from "../sim-cognito-request-resolver.js";
import type { SimCognitoAuthParameters } from "./sim-cognito-auth-parameters.js";

interface SimCognitoAuthResolverProperties {
  readonly resolver: SimCognitoRequestResolver;
  readonly pools: SimCognitoUserPoolStore;
  readonly poolMetrics: SimCognitoPoolMetrics;
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
export type SimCognitoAuthenticatingClient = SimCognitoClientInPool;

/**
 * Resolves what an authentication request names before the flow itself runs.
 *
 * Every authentication command ends up needing the same things: the pool, the
 * app client, a username whose `SECRET_HASH` has been checked, and the user
 * that username reaches.
 */
export class SimCognitoAuthResolver {
  private readonly resolver: SimCognitoRequestResolver;
  private readonly pools: SimCognitoUserPoolStore;
  private readonly poolMetrics: SimCognitoPoolMetrics;

  constructor(properties: SimCognitoAuthResolverProperties) {
    this.resolver = properties.resolver;
    this.pools = properties.pools;
    this.poolMetrics = properties.poolMetrics;
  }

  /**
   * Resolve the pool and app client an admin request names, once the caller
   * may reach the pool.
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

    try {
      return {
        pool,
        client: pool.requireClient(
          requireSimCognitoUserPoolClientId(input.ClientId),
        ),
      };
    } catch (error) {
      // Real Cognito counts a request naming an app client the pool has none
      // of, reporting a fixed name in the client's place rather than the id
      // the request gave. The request still fails.
      this.poolMetrics.count(
        "SignInSuccesses",
        pool.id,
        simCognitoInvalidClientDimension,
        false,
      );

      throw error;
    }
  }

  /**
   * Resolve the pool and app client a client-side request names, which is by
   * app client id alone and with no IAM involved.
   *
   * Real Cognito evaluates no IAM policy for `InitiateAuth`,
   * `RespondToAuthChallenge` or `GlobalSignOut`: they are what a browser or
   * mobile app calls, holding no AWS credentials at all. Authorizing them here
   * would pass tests that a real deployment then fails, and refuse code that
   * really works.
   */
  client(clientId: string | undefined): SimCognitoAuthenticatingClient {
    return this.pools.requireClient(
      requireSimCognitoUserPoolClientId(clientId),
    );
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
