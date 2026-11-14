import type { SimIamInstanceProfile } from "../../instance-profile/sim-iam-instance-profile.js";
import type { SimIamRole } from "../../role/sim-iam-role.js";
import { simIamTagsMember } from "../../tag/sim-iam-identity-tags.js";
import { CreateRoleRecordFactory } from "../role/create-role/create-role-record-factory.js";
import type { SimIamInstanceProfileOutput } from "./sim-iam-instance-profile.command.js";

const roleRecords = new CreateRoleRecordFactory();

/**
 * Describe an instance profile the way IAM does, with the Role it holds.
 */
export function simIamInstanceProfileOutput(
  profile: SimIamInstanceProfile,
  role: SimIamRole | undefined,
): SimIamInstanceProfileOutput {
  return {
    Path: profile.path,
    InstanceProfileName: profile.instanceProfileName,
    InstanceProfileId: profile.instanceProfileId,
    Arn: profile.arn,
    CreateDate: profile.creationDate,
    Roles: role === undefined ? [] : [roleRecords.makeOutput(role).Role],
    ...simIamTagsMember(profile.tags),
  };
}
