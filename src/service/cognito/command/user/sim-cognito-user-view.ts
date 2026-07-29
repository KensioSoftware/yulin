import type { SimCognitoUser } from "../../user-pool/user/sim-cognito-user.js";
import type {
  SimCognitoDescribedUser,
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
    };
  }
}
