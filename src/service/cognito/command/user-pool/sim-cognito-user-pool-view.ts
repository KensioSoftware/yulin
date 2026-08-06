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
   * The settings the pool accepted without acting on are reported back as
   * the request set them, so a template's declaration stays visible. The
   * verification wording is reported the same way, and that one the pool does
   * read: it is what the messages it records say.
   *
   * `LambdaConfig` is reported only by a pool that was created with one, and
   * carries the triggers that pool runs.
   *
   * `MfaConfiguration` is always `OFF` because MFA is not simulated.
   * `EstimatedNumberOfUsers` is how many users the pool holds now. Real
   * Cognito refreshes that number periodically rather than on each write, so
   * it can lag there in a way it never does here.
   *
   * `AdminCreateUserConfig` is reported whether or not the request named it,
   * as real Cognito reports it, because the pool acts on it either way:
   * it is what decides whether `SignUp` is allowed at all.
   */
  describe(pool: SimCognitoUserPool): SimCognitoUserPoolType {
    return {
      Id: pool.id,
      Name: pool.name,
      Arn: pool.arn.value,
      Policies: { PasswordPolicy: pool.settings.passwordPolicy.toOutput() },
      DeletionProtection: pool.settings.deletionProtection.value,
      LambdaConfig: pool.settings.lambdaConfig.toOutput(),
      MfaConfiguration: "OFF",
      AdminCreateUserConfig: pool.settings.adminCreateUserConfig.toOutput(),
      AutoVerifiedAttributes: pool.settings.autoVerifiedAttributes.toOutput(),
      EstimatedNumberOfUsers: pool.userCount,
      CreationDate: pool.creationDate,
      LastModifiedDate: pool.lastModifiedDate,
      ...pool.settings.unsimulated.toOutput(),
      ...pool.settings.verificationMessages.toOutput(),
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
