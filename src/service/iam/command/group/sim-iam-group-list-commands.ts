import type { SimIamActionAuthorizer } from "../../authorize/sim-iam-action-authorizer.js";
import type { SimIamGroup } from "../../group/sim-iam-group.js";
import { simIamPage, type SimIamPageInput } from "../sim-iam-page.js";
import type { SimIamRequestOptions } from "../sim-iam-request-options.js";
import type { SimIamGroupLookup } from "./sim-iam-group-lookup.js";
import {
  simIamGroupOutput,
  type SimListGroupsCommand,
  type SimListGroupsCommandOutput,
  type SimListGroupsForUserCommand,
} from "./sim-iam-group.command.js";

/**
 * The commands that list IAM groups: the Account's, or one User's.
 */
export class SimIamGroupListCommands {
  constructor(
    private readonly authorizer: SimIamActionAuthorizer,
    private readonly lookup: SimIamGroupLookup,
  ) {}

  /**
   * List the Account's groups in name order, under a path prefix if given.
   */
  async listGroups(
    command: SimListGroupsCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimListGroupsCommandOutput> {
    await this.lookup.sequence();
    const { authorizer } = this;
    const { groups } = this.lookup.properties;
    authorizer.authorize("iam:ListGroups", "*", options?.caller);

    const prefix = command.input.PathPrefix ?? "/";

    return this.groupPage(
      groups.values().filter((group) => group.path.startsWith(prefix)),
      command.input,
    );
  }

  /**
   * List the groups one User is in.
   */
  async listGroupsForUser(
    command: SimListGroupsForUserCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimListGroupsCommandOutput> {
    await this.lookup.sequence();
    const user = this.lookup.user(
      "ListGroupsForUser",
      command.input.UserName,
      options,
    );

    return this.groupPage(user.groups.values(), command.input);
  }

  private groupPage(
    groups: Iterable<SimIamGroup>,
    input: SimIamPageInput,
  ): SimListGroupsCommandOutput {
    const { items, ...paging } = simIamPage(
      [...groups].toSorted((a, b) => a.groupName.localeCompare(b.groupName)),
      (group) => group.groupName,
      input,
    );

    return {
      Groups: items.map((group) => simIamGroupOutput(group)),
      ...paging,
    };
  }
}
