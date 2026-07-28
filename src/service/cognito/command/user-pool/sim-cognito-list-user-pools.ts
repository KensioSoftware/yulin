import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import type { SimCognitoUserPoolStore } from "../../user-pool/sim-cognito-user-pool-store.js";
import type { SimCognitoAuthorizer } from "../authorize/sim-cognito-authorizer.js";
import { SimCognitoPage } from "../sim-cognito-page.js";
import { SimCognitoUserPoolView } from "./sim-cognito-user-pool-view.js";
import type {
  SimListUserPoolsCommand,
  SimListUserPoolsCommandOutput,
} from "./list-user-pools.command.js";

interface SimCognitoListUserPoolsProperties {
  readonly pools: SimCognitoUserPoolStore;
  readonly authorizer: SimCognitoAuthorizer;
}

interface SimCognitoListUserPoolsOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The ListUserPools command.
 *
 * Real Cognito gives this action no resource-level permissions, so it
 * authorizes against `*` rather than against each pool, and it does not
 * filter the list by what the caller can reach.
 */
export class SimCognitoListUserPools {
  private readonly pools: SimCognitoUserPoolStore;
  private readonly authorizer: SimCognitoAuthorizer;
  private readonly view = new SimCognitoUserPoolView();

  constructor(properties: SimCognitoListUserPoolsProperties) {
    this.pools = properties.pools;
    this.authorizer = properties.authorizer;
  }

  /**
   * Read the requested page size, which `ListUserPools` insists on.
   *
   * This is the one listing input real Cognito requires, and a request
   * omitting it fails validation rather than falling back to a default.
   */
  private static requiredMaxResults(requested: number | undefined): number {
    if (requested === undefined) {
      throw new SimCognitoInvalidParameterException(
        "ListUserPools MaxResults is required: ask for between 1 and 60 pools",
      );
    }

    return requested;
  }

  /**
   * List the user pools in this scope, in creation order.
   */
  handle(
    command: SimListUserPoolsCommand,
    options?: SimCognitoListUserPoolsOptions,
  ): SimListUserPoolsCommandOutput {
    const { input } = command;

    this.authorizer.authorizeAny("cognito-idp:ListUserPools", options?.caller);

    const page = new SimCognitoPage(this.pools.all, {
      maxResults: SimCognitoListUserPools.requiredMaxResults(input.MaxResults),
      nextToken: input.NextToken,
    });

    return {
      $metadata: {},
      UserPools: page.items.map((pool) => this.view.listEntry(pool)),
      NextToken: page.nextToken,
    };
  }
}
