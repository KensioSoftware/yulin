import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimCognitoPage } from "../sim-cognito-page.js";
import { SimCognitoUnsimulatedUserOptions } from "./sim-cognito-unsimulated-user-options.js";
import type { SimCognitoRequestResolver } from "../sim-cognito-request-resolver.js";
import { SimCognitoUserView } from "./sim-cognito-user-view.js";
import type {
  SimListUsersCommand,
  SimListUsersCommandOutput,
} from "./list-users.command.js";

interface SimCognitoListUsersProperties {
  readonly resolver: SimCognitoRequestResolver;
}

interface SimCognitoCommandOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * How many users a page holds when the request does not say.
 *
 * Sixty is the most Cognito will return either way.
 */
const defaultLimit = 60;

/**
 * The ListUsers command.
 *
 * This pages by `Limit` and `PaginationToken` rather than by `MaxResults` and
 * `NextToken`, which is how the real operation names them.
 */
export class SimCognitoListUsers {
  private readonly resolver: SimCognitoRequestResolver;
  private readonly view = new SimCognitoUserView();
  private readonly unsimulatedOptions = new SimCognitoUnsimulatedUserOptions();

  constructor(properties: SimCognitoListUsersProperties) {
    this.resolver = properties.resolver;
  }

  /**
   * List the users of one pool, in creation order.
   *
   * Real Cognito chooses its own order and does not promise one, so nothing
   * should depend on this order beyond a test reading back what it created.
   */
  handle(
    command: SimListUsersCommand,
    options?: SimCognitoCommandOptions,
  ): SimListUsersCommandOutput {
    const { input } = command;
    const pool = this.resolver.pool(
      "cognito-idp:ListUsers",
      input.UserPoolId,
      options,
    );

    this.unsimulatedOptions.refuseInList(input);

    const page = new SimCognitoPage(pool.users, {
      maxResults: input.Limit ?? defaultLimit,
      nextToken: input.PaginationToken,
      maxResultsField: "Limit",
      nextTokenField: "PaginationToken",
    });

    return {
      $metadata: {},
      Users: page.items.map((user) => this.view.entry(user)),
      PaginationToken: page.nextToken,
    };
  }
}
