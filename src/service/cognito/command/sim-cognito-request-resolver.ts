import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimCognitoGroup } from "../user-pool/group/sim-cognito-group.js";
import { requireSimCognitoGroupName } from "../user-pool/group/sim-cognito-group-name.js";
import type { SimCognitoUserPool } from "../user-pool/sim-cognito-user-pool.js";
import { requireSimCognitoUserPoolId } from "../user-pool/sim-cognito-user-pool-id.js";
import type { SimCognitoUserPoolStore } from "../user-pool/sim-cognito-user-pool-store.js";
import type { SimCognitoUser } from "../user-pool/user/sim-cognito-user.js";
import { requireSimCognitoUsername } from "../user-pool/user/sim-cognito-username.js";
import type { SimCognitoAuthorizer } from "./authorize/sim-cognito-authorizer.js";

interface SimCognitoRequestResolverProperties {
  readonly pools: SimCognitoUserPoolStore;
  readonly authorizer: SimCognitoAuthorizer;
}

interface SimCognitoCommandOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * What an operation naming a user in a pool has resolved.
 */
export interface SimCognitoUserInPool {
  readonly pool: SimCognitoUserPool;
  readonly user: SimCognitoUser;
}

/**
 * What an operation naming a group in a pool has resolved.
 */
export interface SimCognitoGroupInPool {
  readonly pool: SimCognitoUserPool;
  readonly group: SimCognitoGroup;
}

/**
 * What a membership operation has resolved: the group, and the user going
 * into or out of it.
 */
export interface SimCognitoGroupMembership {
  readonly group: SimCognitoGroup;
  readonly user: SimCognitoUser;
}

/**
 * What every request names: the pool, and the user or group in it.
 */
interface SimCognitoResourceInput {
  readonly UserPoolId?: string | undefined;
  readonly Username?: string | undefined;
  readonly GroupName?: string | undefined;
}

/**
 * Resolves the pool, user and group an operation names.
 *
 * Every one of them starts the same way: authorize against the pool's ARN,
 * because neither a user nor a group has an ARN of its own, then find the
 * pool, then find what the request named in it. Authorization comes first, as
 * real IAM evaluates a request before the service handles it, so a caller
 * with no permission is refused whether or not the user or group is there.
 */
export class SimCognitoRequestResolver {
  private readonly pools: SimCognitoUserPoolStore;
  private readonly authorizer: SimCognitoAuthorizer;

  constructor(properties: SimCognitoRequestResolverProperties) {
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
    input: SimCognitoResourceInput,
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
    input: SimCognitoResourceInput,
    options: SimCognitoCommandOptions | undefined,
  ): SimCognitoUser {
    return this.poolUser(action, input, options).user;
  }

  /**
   * Resolve the group an operation names, and the pool holding it.
   */
  poolGroup(
    action: string,
    input: SimCognitoResourceInput,
    options: SimCognitoCommandOptions | undefined,
  ): SimCognitoGroupInPool {
    const pool = this.pool(action, input.UserPoolId, options);

    return {
      pool,
      group: pool.requireGroup(requireSimCognitoGroupName(input.GroupName)),
    };
  }

  /**
   * Resolve the group an operation names, once the caller may reach its pool.
   */
  group(
    action: string,
    input: SimCognitoResourceInput,
    options: SimCognitoCommandOptions | undefined,
  ): SimCognitoGroup {
    return this.poolGroup(action, input, options).group;
  }

  /**
   * Resolve the group and the user a membership operation names.
   *
   * The user is resolved first, as the operation is an `Admin` one naming a
   * user, so a request naming neither reports the user missing.
   */
  membership(
    action: string,
    input: SimCognitoResourceInput,
    options: SimCognitoCommandOptions | undefined,
  ): SimCognitoGroupMembership {
    const { pool, user } = this.poolUser(action, input, options);

    return {
      group: pool.requireGroup(requireSimCognitoGroupName(input.GroupName)),
      user,
    };
  }
}
