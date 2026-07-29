import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { requireSimCognitoUserPoolId } from "../../user-pool/sim-cognito-user-pool-id.js";
import type { SimCognitoUserPoolStore } from "../../user-pool/sim-cognito-user-pool-store.js";
import type { SimCognitoAuthorizer } from "../authorize/sim-cognito-authorizer.js";
import { SimCognitoPage } from "../sim-cognito-page.js";
import { SimCognitoUserPoolClientView } from "./sim-cognito-user-pool-client-view.js";
import type {
  SimListUserPoolClientsCommand,
  SimListUserPoolClientsCommandOutput,
} from "./list-user-pool-clients.command.js";

interface SimCognitoListUserPoolClientsProperties {
  readonly pools: SimCognitoUserPoolStore;
  readonly authorizer: SimCognitoAuthorizer;
}

interface SimCognitoListUserPoolClientsOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * How many app clients a page holds when the request does not say.
 *
 * Unlike `ListUserPools`, this operation does not insist on being told, and
 * sixty is the most Cognito will return either way.
 */
const defaultMaxResults = 60;

/**
 * The ListUserPoolClients command.
 *
 * This authorizes against the pool, not against `*`, because real Cognito
 * gives the action a resource-level permission on the pool whose clients are
 * being listed.
 */
export class SimCognitoListUserPoolClients {
  private readonly pools: SimCognitoUserPoolStore;
  private readonly authorizer: SimCognitoAuthorizer;
  private readonly view = new SimCognitoUserPoolClientView();

  constructor(properties: SimCognitoListUserPoolClientsProperties) {
    this.pools = properties.pools;
    this.authorizer = properties.authorizer;
  }

  /**
   * List the app clients of one pool, in creation order.
   */
  handle(
    command: SimListUserPoolClientsCommand,
    options?: SimCognitoListUserPoolClientsOptions,
  ): SimListUserPoolClientsCommandOutput {
    const { input } = command;
    const userPoolId = requireSimCognitoUserPoolId(input.UserPoolId);

    this.authorizer.authorizeUserPool(
      "cognito-idp:ListUserPoolClients",
      userPoolId,
      options?.caller,
    );

    const page = new SimCognitoPage(this.pools.require(userPoolId).clients, {
      maxResults: input.MaxResults ?? defaultMaxResults,
      nextToken: input.NextToken,
    });

    return {
      $metadata: {},
      UserPoolClients: page.items.map((client) => this.view.listEntry(client)),
      NextToken: page.nextToken,
    };
  }
}
