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
   * `AccountRecoverySetting` is reported back as the request set it, so a
   * template's declaration stays visible, and only by a pool that was created
   * with one. Nothing here reads it: there is no `ForgotPassword`. The
   * verification wording is reported the same way, and that one the pool does
   * read: it is what the messages it records say.
   *
   * `LambdaConfig` is reported only by a pool that was created with one, and
   * carries the triggers that pool runs.
   *
   * `MfaConfiguration` is what the pool was asked for, and no pool here
   * challenges for a second factor whatever it says. Which factors a pool
   * offers is not reported here on real Cognito either:
   * `GetUserPoolMfaConfig` is what reports those.
   *
   * `UsernameAttributes` is reported only by a pool that signs its users in
   * by one, and is what says why that pool's usernames are UUIDs.
   *
   * `SchemaAttributes` is every attribute the pool holds on a user: the
   * standard ones and the `custom:` ones its `Schema` declared, each under the
   * name Cognito gave it.
   *
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
      AccountRecoverySetting: pool.settings.accountRecovery.toOutput(),
      Policies: { PasswordPolicy: pool.settings.passwordPolicy.toOutput() },
      DeletionProtection: pool.settings.deletionProtection.value,
      LambdaConfig: pool.settings.lambdaConfig.toOutput(),
      MfaConfiguration: pool.settings.mfa.configuration.value,
      AdminCreateUserConfig: pool.settings.adminCreateUserConfig.toOutput(),
      AutoVerifiedAttributes: pool.settings.autoVerifiedAttributes.toOutput(),
      UsernameAttributes: pool.settings.usernameAttributes.toOutput(),
      SchemaAttributes: pool.settings.schema.toOutput(),
      EstimatedNumberOfUsers: pool.userCount,
      CreationDate: pool.creationDate,
      LastModifiedDate: pool.lastModifiedDate,
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
