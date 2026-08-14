import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimCognitoDomainRegistry } from "../../registry/sim-cognito-domain-registry.js";
import { SimCognitoPoolDomains } from "../../user-pool/domain/sim-cognito-pool-domains.js";
import type { SimCognitoUserPool } from "../../user-pool/sim-cognito-user-pool.js";
import { requireSimCognitoUserPoolId } from "../../user-pool/sim-cognito-user-pool-id.js";
import type { SimCognitoUserPoolStore } from "../../user-pool/sim-cognito-user-pool-store.js";
import type { SimCognitoAuthorizer } from "../authorize/sim-cognito-authorizer.js";
import { SimCognitoUnsimulatedInput } from "../sim-cognito-unsimulated-input.js";
import { SimCognitoDomainView } from "./sim-cognito-domain-view.js";
import type {
  SimCreateUserPoolDomainCommand,
  SimCreateUserPoolDomainCommandOutput,
  SimDeleteUserPoolDomainCommand,
  SimDeleteUserPoolDomainCommandOutput,
  SimDescribeUserPoolDomainCommand,
  SimDescribeUserPoolDomainCommandOutput,
} from "./user-pool-domain.command.js";

interface SimCognitoDomainCommandsProperties {
  readonly pools: SimCognitoUserPoolStore;
  readonly domains: SimCognitoDomainRegistry;
  readonly authorizer: SimCognitoAuthorizer;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

interface SimCognitoCommandOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The commands that create, describe and delete a simulated user pool domain.
 *
 * A domain is what turns a pool from an API into something a browser can sign
 * in at: the OAuth endpoints are served on its hostname and nowhere else.
 */
export class SimCognitoDomainCommands {
  private readonly pools: SimCognitoUserPoolStore;
  private readonly domains: SimCognitoDomainRegistry;
  private readonly authorizer: SimCognitoAuthorizer;
  private readonly view: SimCognitoDomainView;
  private readonly poolDomains = new SimCognitoPoolDomains();
  private readonly unsimulated = new SimCognitoUnsimulatedInput(
    "CreateUserPoolDomain",
  );

  constructor(properties: SimCognitoDomainCommandsProperties) {
    this.pools = properties.pools;
    this.domains = properties.domains;
    this.authorizer = properties.authorizer;
    this.view = new SimCognitoDomainView({
      accountRegionScope: properties.accountRegionScope,
    });
  }

  /**
   * Give a pool the domain its OAuth endpoints are served on.
   *
   * A `CustomDomainConfig` is what says the request wants a custom domain
   * rather than a Cognito prefix, and the two are validated differently
   * because they are different things: a prefix is one label Cognito puts
   * under `auth.<region>.amazoncognito.com`, and a custom domain is a
   * hostname the request owns.
   */
  create(
    command: SimCreateUserPoolDomainCommand,
    options?: SimCognitoCommandOptions,
  ): SimCreateUserPoolDomainCommandOutput {
    const { input } = command;
    const pool = this.authorizedPool(
      "cognito-idp:CreateUserPoolDomain",
      input.UserPoolId,
      options,
    );

    this.unsimulated.refuse(
      "Routing",
      input.Routing,
      "multi-region failover routing",
    );

    const domain = this.poolDomains.make(pool, input);

    this.domains.register(domain);
    pool.auth.addDomain(domain);

    return {
      $metadata: {},
      CloudFrontDomain: domain.cloudFrontDistribution,
      ManagedLoginVersion: domain.managedLoginVersion,
    };
  }

  /**
   * Describe a domain, which a request names on its own.
   *
   * A domain is unique across AWS, so no pool id is needed to find one. A
   * domain nothing holds is answered with an empty description rather than a
   * refusal, as real Cognito answers one.
   */
  describe(
    command: SimDescribeUserPoolDomainCommand,
    options?: SimCognitoCommandOptions,
  ): SimDescribeUserPoolDomainCommandOutput {
    const domain = this.domains.find(command.input.Domain);

    if (domain === undefined) {
      return { $metadata: {}, DomainDescription: {} };
    }

    this.authorizer.authorizeUserPool(
      "cognito-idp:DescribeUserPoolDomain",
      domain.userPoolId,
      options?.caller,
    );

    return { $metadata: {}, DomainDescription: this.view.describe(domain) };
  }

  /**
   * Delete a pool's domain, which stops its OAuth endpoints answering.
   *
   * The domain string goes back into use, as it does on real AWS: a prefix is
   * free for another pool once the pool holding it has let it go.
   */
  delete(
    command: SimDeleteUserPoolDomainCommand,
    options?: SimCognitoCommandOptions,
  ): SimDeleteUserPoolDomainCommandOutput {
    const { input } = command;
    const pool = this.authorizedPool(
      "cognito-idp:DeleteUserPoolDomain",
      input.UserPoolId,
      options,
    );
    const domain = this.poolDomains.require(pool, input.Domain);

    this.domains.deregister(domain);
    pool.auth.removeDomain();

    return { $metadata: {} };
  }

  /**
   * Resolve the pool a domain operation names, once the caller is allowed to
   * reach it.
   */
  private authorizedPool(
    action: string,
    requestedUserPoolId: string | undefined,
    options: SimCognitoCommandOptions | undefined,
  ): SimCognitoUserPool {
    const userPoolId = requireSimCognitoUserPoolId(requestedUserPoolId);

    this.authorizer.authorizeUserPool(action, userPoolId, options?.caller);

    return this.pools.require(userPoolId);
  }
}
