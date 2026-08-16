import type { SimCognitoUser } from "../../user-pool/user/sim-cognito-user.js";
import type {
  SimCognitoDescribedUser,
  SimCognitoSelfUser,
  SimCognitoUserFactors,
  SimCognitoUserType,
} from "./user.command.js";

/**
 * How a simulated user is reported back to a caller.
 *
 * `AdminGetUser` answers with the user's properties directly and calls the
 * attributes `UserAttributes`. `AdminCreateUser` and `ListUsers` answer with a
 * `UserType`, which calls the same attributes `Attributes`. Both shapes are
 * built here so the difference is deliberate rather than accidental.
 */
export class SimCognitoUserView {
  /**
   * The second factors a user has registered, which both reads report.
   *
   * A user with none is reported without either field, rather than with an
   * empty list, because that is what real Cognito answers for one.
   */
  private static factors(user: SimCognitoUser): SimCognitoUserFactors {
    const settings = user.mfa.settings;
    const preferred = user.mfa.preferred;

    return {
      ...(settings.length > 0 && { UserMFASettingList: settings }),
      ...(preferred !== undefined && { PreferredMfaSetting: preferred }),
    };
  }

  /**
   * A user as `AdminCreateUser` and `ListUsers` report it.
   */
  entry(user: SimCognitoUser): SimCognitoUserType {
    return {
      Username: user.username,
      Attributes: user.attributes,
      UserCreateDate: user.creationDate,
      UserLastModifiedDate: user.lastModifiedDate,
      Enabled: user.enabled,
      UserStatus: user.status.value,
    };
  }

  /**
   * A user as `AdminGetUser` reports it.
   */
  describe(user: SimCognitoUser): SimCognitoDescribedUser {
    return {
      Username: user.username,
      UserAttributes: user.attributes,
      UserCreateDate: user.creationDate,
      UserLastModifiedDate: user.lastModifiedDate,
      Enabled: user.enabled,
      UserStatus: user.status.value,
      ...SimCognitoUserView.factors(user),
    };
  }

  /**
   * A user as `GetUser` reports it to the user itself.
   *
   * There is no status, no creation date and no `Enabled` here, because real
   * Cognito reports those to an administrator and not to the user.
   */
  self(user: SimCognitoUser): SimCognitoSelfUser {
    return {
      Username: user.username,
      UserAttributes: user.attributes,
      ...SimCognitoUserView.factors(user),
    };
  }
}
