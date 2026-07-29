import type { SimCognitoGroup } from "../../user-pool/group/sim-cognito-group.js";
import type { SimCognitoGroupType } from "./group.command.js";

/**
 * How a simulated group is reported back to a caller.
 *
 * Every group operation reports the same shape, and a property the group does
 * not have is left out rather than reported as a default, which is what real
 * Cognito does: a group with no precedence has no `Precedence` in the
 * response, and code reading one has to cope with that.
 */
export class SimCognitoGroupView {
  /**
   * A group as `CreateGroup`, `GetGroup`, `UpdateGroup` and the group
   * listings report it.
   */
  describe(group: SimCognitoGroup): SimCognitoGroupType {
    return {
      GroupName: group.name,
      UserPoolId: group.userPoolId,
      Description: group.description,
      Precedence: group.precedence,
      RoleArn: group.roleArn,
      CreationDate: group.creationDate,
      LastModifiedDate: group.lastModifiedDate,
    };
  }
}
