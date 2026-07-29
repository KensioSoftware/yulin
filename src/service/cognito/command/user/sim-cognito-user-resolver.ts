import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimCognitoUserPool } from "../../user-pool/sim-cognito-user-pool.js";
import { requireSimCognitoUserPoolId } from "../../user-pool/sim-cognito-user-pool-id.js";
import type { SimCognitoUserPoolStore } from "../../user-pool/sim-cognito-user-pool-store.js";
import type { SimCognitoUser } from "../../user-pool/user/sim-cognito-user.js";
import { requireSimCognitoUsername } from "../../user-pool/user/sim-cognito-username.js";
import type { SimCognitoAuthorizer } from "../authorize/sim-cognito-authorizer.js";
import type { SimCognitoAdminUserCommandInput } from "./user.command.js";

interface SimCognitoUserResolverProperties {
  readonly pools: SimCognitoUserPoolStore;
  readonly authorizer: SimCognitoAuthorizer;
}

interface SimCognitoCommandOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * A user, and the pool holding it.
 */
export interface SimCognitoUserInPool {
  readonly pool: SimCognitoUserPool;
  readonly user: SimCognitoUser;
}

/**
 * Resolves the pool and the user an admin operation names.
 *
 * Every user operation starts the same way: authorize against the pool's ARN,
 * because a user has no ARN of its own, then find the pool, then find the user
 * in it. Authorization comes first, as real IAM evaluates a request before the
 * service handles it, so a caller with no permission is refused whether or not
 * the user is there.
 */
export class SimCognitoUserResolver {
  private readonly pools: SimCognitoUserPoolStore;
  private readonly authorizer: SimCognitoAuthorizer;

  constructor(properties: SimCognitoUserResolverProperties) {
    this.pools = properties.pools;
    this.authorizer = properties.authorizer;
  }

  /**
   * Resolve the pool an operation names, once the caller may reach it.
   */
  pool(
    action: string,
    userPoolId: string | undefined,
    options: SimCognitoCommandOptions | undefined,
  ): SimCognitoUserPool {
    const poolId = requireSimCognitoUserPoolId(userPoolId);

    this.authorizer.authorizeUserPool(action, poolId, options?.caller);

    return this.pools.require(poolId);
  }

  /**
   * Resolve the user an operation names, and the pool holding it.
   */
  poolUser(
    action: string,
    input: SimCognitoAdminUserCommandInput,
    options: SimCognitoCommandOptions | undefined,
  ): SimCognitoUserInPool {
    const pool = this.pool(action, input.UserPoolId, options);

    return {
      pool,
      user: pool.requireUser(requireSimCognitoUsername(input.Username)),
    };
  }

  /**
   * Resolve the user an operation names, once the caller may reach its pool.
   */
  user(
    action: string,
    input: SimCognitoAdminUserCommandInput,
    options: SimCognitoCommandOptions | undefined,
  ): SimCognitoUser {
    return this.poolUser(action, input, options).user;
  }
}
