import type { SimArn } from "../../../aws/arn.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import {
  SimIamDeleteConflict,
  SimIamEntityAlreadyExists,
} from "../../error/sim-iam.error.js";
import {
  makeSimIamGroupId,
  type SimIamGroup,
  type SimIamGroupName,
} from "../../group/sim-iam-group.js";
import { normaliseUserPath } from "../../user/sim-iam-user-path.js";
import type { SimIamEmptyOutput } from "../entity/sim-iam-entity-policy.command.js";
import { simIamRefuseWhen } from "../sim-iam-found.js";
import { simIamPage } from "../sim-iam-page.js";
import type { SimIamRequestOptions } from "../sim-iam-request-options.js";
import { simIamRequired } from "../sim-iam-required.js";
import { CreateUserRecordFactory } from "../user/create-user/create-user-record-factory.js";
import type { SimIamGroupLookup } from "./sim-iam-group-lookup.js";
import { assertSimIamGroupName } from "./sim-iam-group-name.js";
import {
  type SimCreateGroupCommand,
  type SimCreateGroupCommandOutput,
  type SimDeleteGroupCommand,
  type SimGetGroupCommand,
  type SimGetGroupCommandOutput,
  simIamGroupOutput,
} from "./sim-iam-group.command.js";

/**
 * The commands that create, describe and delete IAM groups.
 */
export class SimIamGroupCommands {
  private readonly userRecords = new CreateUserRecordFactory();
  constructor(
    private readonly accountId: SimAwsAccountId,
    private readonly lookup: SimIamGroupLookup,
  ) {}

  /**
   * Create a group at a path, `/` where the command gives none.
   */
  async createGroup(
    command: SimCreateGroupCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimCreateGroupCommandOutput> {
    await this.lookup.sequence();
    const { accountId } = this;
    const { groups, groupIdentity, background } = this.lookup.properties;
    const name = simIamRequired(command.input.GroupName, "groupName");
    const path = normaliseUserPath(command.input.Path);
    assertSimIamGroupName(name);
    groupIdentity.authorize("iam:CreateGroup", name, options, {}, path);

    // IAM keeps a name as given, and holds names apart regardless of case.
    simIamRefuseWhen(
      groups.keys().some((each) => each.toLowerCase() === name.toLowerCase()),
      () =>
        new SimIamEntityAlreadyExists(
          `Group with name ${name} already exists.`,
        ),
    );

    const group: SimIamGroup = {
      arn: `arn:aws:iam::${accountId}:group${path}${name}` as SimArn,
      groupId: makeSimIamGroupId(),
      groupName: name as SimIamGroupName,
      path,
      creationDate: background.now(),
      inlinePolicies: new Map(),
      attachedPolicyArns: new Set(),
    };
    groups.set(group.groupName, group);

    return { Group: simIamGroupOutput(group) };
  }

  /**
   * Describe a group and list the Users in it.
   */
  async getGroup(
    command: SimGetGroupCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimGetGroupCommandOutput> {
    await this.lookup.sequence();
    const group = this.lookup.group(
      "GetGroup",
      command.input.GroupName,
      options,
    );
    const { items, ...paging } = simIamPage(
      this.lookup.members(group),
      (user) => user.userName,
      command.input,
    );

    return {
      Group: simIamGroupOutput(group),
      Users: items.map((user) => this.userRecords.makeOutput(user).User),
      ...paging,
    };
  }

  /**
   * Delete a group with no Users in it and no policies on it.
   */
  async deleteGroup(
    command: SimDeleteGroupCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimIamEmptyOutput> {
    await this.lookup.sequence();
    const group = this.lookup.group(
      "DeleteGroup",
      command.input.GroupName,
      options,
    );

    simIamRefuseWhen(
      this.lookup.members(group).length > 0,
      () =>
        new SimIamDeleteConflict(
          "Cannot delete entity, must remove users from group first.",
        ),
    );

    simIamRefuseWhen(
      group.inlinePolicies.size + group.attachedPolicyArns.size > 0,
      () =>
        new SimIamDeleteConflict(
          "Cannot delete entity, must delete policies first.",
        ),
    );

    this.lookup.properties.groups.delete(group.groupName);

    return {};
  }
}
