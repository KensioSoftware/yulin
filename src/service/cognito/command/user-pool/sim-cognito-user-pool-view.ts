import type { SimCognitoUserPool } from "../../user-pool/sim-cognito-user-pool.js";
import type { SimCognitoUserPoolDescriptionType } from "./list-user-pools.command.js";
import type { SimCognitoUserPoolType } from "./user-pool.command.js";

/**
 * How a simulated user pool is reported back to a caller.
 *
 * A described pool and a listed one carry different properties on real
 * Cognito, so both shapes are built here rather than at each command.
 */
export class SimCognitoUserPoolView {
  /**
   * A pool as `CreateUserPool` and `DescribeUserPool` report it.
   *
   * `MfaConfiguration` is always `OFF` because MFA is not simulated.
   * `EstimatedNumberOfUsers` is how many users the pool holds now. Real
   * Cognito refreshes that number periodically rather than on each write, so
   * it can lag there in a way it never does here.
   */
  describe(pool: SimCognitoUserPool): SimCognitoUserPoolType {
    return {
      Id: pool.id,
      Name: pool.name,
      Arn: pool.arn.value,
      Policies: { PasswordPolicy: pool.passwordPolicy.toOutput() },
      DeletionProtection: pool.deletionProtection.value,
      MfaConfiguration: "OFF",
      EstimatedNumberOfUsers: pool.userCount,
      CreationDate: pool.creationDate,
      LastModifiedDate: pool.lastModifiedDate,
    };
  }

  /**
   * A pool as `ListUserPools` reports it, which carries no ARN and no
   * settings.
   */
  listEntry(pool: SimCognitoUserPool): SimCognitoUserPoolDescriptionType {
    return {
      Id: pool.id,
      Name: pool.name,
      CreationDate: pool.creationDate,
      LastModifiedDate: pool.lastModifiedDate,
    };
  }
}
