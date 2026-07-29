import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimCognitoPage } from "../sim-cognito-page.js";
import type { SimCognitoRequestResolver } from "../sim-cognito-request-resolver.js";
import { SimCognitoGroupView } from "./sim-cognito-group-view.js";
import type {
  SimListGroupsCommand,
  SimListGroupsCommandOutput,
} from "./group.command.js";

interface SimCognitoListGroupsProperties {
  readonly resolver: SimCognitoRequestResolver;
}

interface SimCognitoCommandOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * How many groups a page holds when the request does not say.
 */
const defaultLimit = 60;

/**
 * The ListGroups command.
 */
export class SimCognitoListGroups {
  private readonly resolver: SimCognitoRequestResolver;
  private readonly view = new SimCognitoGroupView();

  constructor(properties: SimCognitoListGroupsProperties) {
    this.resolver = properties.resolver;
  }

  /**
   * List the groups of one pool, in creation order.
   *
   * This is not precedence order. `AdminListGroupsForUser` is the one that
   * sorts, because that is the listing whose order decides which group's role
   * a user prefers.
   */
  handle(
    command: SimListGroupsCommand,
    options?: SimCognitoCommandOptions,
  ): SimListGroupsCommandOutput {
    const { input } = command;
    const pool = this.resolver.pool(
      "cognito-idp:ListGroups",
      input.UserPoolId,
      options,
    );

    const page = new SimCognitoPage(pool.groups, {
      maxResults: input.Limit ?? defaultLimit,
      nextToken: input.NextToken,
      maxResultsField: "Limit",
    });

    return {
      $metadata: {},
      Groups: page.items.map((group) => this.view.describe(group)),
      NextToken: page.nextToken,
    };
  }
}
