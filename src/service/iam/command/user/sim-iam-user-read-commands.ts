import { simIamPage } from "../sim-iam-page.js";
import type { SimIamRequestOptions } from "../sim-iam-request-options.js";
import { CreateUserRecordFactory } from "./create-user/create-user-record-factory.js";
import type { SimIamUserLookup } from "./sim-iam-user-lookup.js";
import type {
  SimGetUserCommand,
  SimGetUserCommandOutput,
  SimListUsersCommand,
  SimListUsersCommandOutput,
} from "./sim-iam-user-read.command.js";

/**
 * The commands that describe Users: GetUser and ListUsers.
 */
export class SimIamUserReadCommands {
  private readonly records = new CreateUserRecordFactory();

  constructor(private readonly lookup: SimIamUserLookup) {}

  /**
   * Describe a User, or the calling User where the command names none.
   */
  async getUser(
    command: SimGetUserCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimGetUserCommandOutput> {
    await this.lookup.sequence();
    const user = this.lookup.user("GetUser", command.input.UserName, options);

    return this.records.makeOutput(user);
  }

  /**
   * List the Account's Users in name order, under a path prefix if given.
   */
  async listUsers(
    command: SimListUsersCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimListUsersCommandOutput> {
    await this.lookup.sequence();
    const { authorizer, users } = this.lookup.properties;
    authorizer.authorize("iam:ListUsers", "*", options?.caller);

    const { PathPrefix = "/" } = command.input;
    const listed = users
      .values()
      .filter((user) => user.path.startsWith(PathPrefix))
      .toArray()
      .toSorted((a, b) => a.userName.localeCompare(b.userName));
    const { items, ...paging } = simIamPage(
      listed,
      (user) => user.userName,
      command.input,
    );

    return {
      Users: items.map((user) => this.records.makeOutput(user).User),
      ...paging,
    };
  }
}
