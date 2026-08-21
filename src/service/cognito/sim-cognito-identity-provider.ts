import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import {
  SimWafNoProtection,
  type SimWafProtection,
} from "../wafv2/association/sim-waf-protection.js";
import { SimCognitoCfnResourceFactory } from "./cfn/sim-cfn-cognito-resource-factory.js";
import { SimCognitoCommands } from "./command/sim-cognito-commands.js";
import { SimCognitoDomainRegistry } from "./registry/sim-cognito-domain-registry.js";
import { SimCognitoUserPoolRegistry } from "./registry/sim-cognito-user-pool-registry.js";
import { SimCognitoSdkCommandRouter } from "./sdk/sim-cognito-sdk-command-router.js";
import { SimCognitoUserPools } from "./sim-cognito-user-pools.js";
import type { SimCognitoUserPoolClient } from "./user-pool/client/sim-cognito-user-pool-client.js";
import type { SimCognitoUserPoolDomain } from "./user-pool/domain/sim-cognito-user-pool-domain.js";
import {
  SimCognitoNoEmailSenders,
  type SimCognitoEmailSenders,
} from "./user-pool/message/sim-cognito-email-senders.js";
import type {
  SimCognitoUserPoolClientRegistration,
  SimCognitoUserPoolRegistration,
} from "./user-pool/sim-cognito-registration.types.js";

import type { SimCognitoUserPool } from "./user-pool/sim-cognito-user-pool.js";
import {
  requireSimCognitoUserPoolId,
  type SimCognitoUserPoolId,
} from "./user-pool/sim-cognito-user-pool-id.js";
import { SimCognitoUserPoolStore } from "./user-pool/sim-cognito-user-pool-store.js";
import {
  SimCognitoNoTriggerFunctions,
  type SimCognitoTriggerFunctions,
} from "./user-pool/trigger/sim-cognito-trigger-functions.js";

export type { SimCognitoIdentityProviderRequestOptions } from "./sim-cognito-user-directory.js";

interface SimCognitoIdentityProviderProperties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;

  /**
   * Where every pool in the simulation is indexed by id. Pool ids are unique
   * across a simulation, and a pool is reachable by id alone from the serving
   * layer, whichever scope created it.
   */
  readonly userPoolRegistry?: SimCognitoUserPoolRegistry;

  /**
   * Where every hosted domain in the simulation is indexed. A domain is unique
   * across the whole of AWS rather than within one Account, and a request to
   * one carries a hostname that says nothing about which Account owns the pool
   * behind it.
   */
  readonly domainRegistry?: SimCognitoDomainRegistry;

  /**
   * The Lambda functions a pool's triggers can reach, which is the whole
   * simulation rather than this scope: a `LambdaConfig` names a function by
   * ARN, and that ARN can name any Account and Region.
   */
  readonly triggerFunctions?: SimCognitoTriggerFunctions;

  /**
   * The simulated SES a pool with `EmailSendingAccount: DEVELOPER` sends
   * through, which is the whole simulation rather than this scope for the same
   * reason the trigger functions are: a `SourceArn` names its own region.
   */
  readonly emailSenders?: SimCognitoEmailSenders;

  /**
   * The web ACLs this scope's pools can be protected by. A standalone
   * simulated Cognito has none, so a hosted domain serves the requests it
   * always did.
   */
  readonly webAcls?: SimWafProtection;
}

/**
 * Simulated Cognito user pools. Handles SDK commands. Emulates AWS behaviour
 * and state.
 *
 * Pools are scoped to an account and region, as they are on real AWS: a pool
 * id names the region it was created in, and an app client id is only
 * meaningful inside its pool.
 *
 * The pool operations are here. The app client ones are on
 * `SimCognitoAppClients` and the user and group ones on
 * `SimCognitoUserDirectory`, both of which this extends, so a caller reaches
 * all of them on one service object.
 *
 * Only user pools are simulated. Cognito identity pools, which hand out AWS
 * credentials, are a different service and are not simulated at all.
 */
export class SimCognitoIdentityProvider extends SimCognitoUserPools {
  private readonly pools: SimCognitoUserPoolStore;
  private readonly userPoolRegistry: SimCognitoUserPoolRegistry;
  private readonly domainRegistry: SimCognitoDomainRegistry;
  private readonly sdkRouter = new SimCognitoSdkCommandRouter(this);
  private readonly cfnFactory = new SimCognitoCfnResourceFactory({
    cognito: this,
  });

  constructor(properties: SimCognitoIdentityProviderProperties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
      userPoolRegistry = new SimCognitoUserPoolRegistry(),
      domainRegistry = new SimCognitoDomainRegistry(),
      triggerFunctions = new SimCognitoNoTriggerFunctions(),
      emailSenders = new SimCognitoNoEmailSenders(),
      webAcls = new SimWafNoProtection(),
    } = properties;
    const pools = new SimCognitoUserPoolStore({
      registry: userPoolRegistry,
      domains: domainRegistry,
    });

    super({
      commands: new SimCognitoCommands({
        accountRegionScope,
        iam,
        clock: background,
        pools,
        domains: domainRegistry,
        triggerFunctions,
        emailSenders,
        webAcls,
      }),
      background,
    });

    this.pools = pools;
    this.userPoolRegistry = userPoolRegistry;
    this.domainRegistry = domainRegistry;
  }

  /**
   * Find a hosted domain by the domain string it was created with, in
   * whichever Account and Region created it.
   *
   * A request to a hosted endpoint carries a hostname and nothing else, so
   * this is what the serving layer resolves it with.
   */
  findUserPoolDomainInAnyAccount(
    domainValue: string,
  ): SimCognitoUserPoolDomain | undefined {
    return this.domainRegistry.find(domainValue);
  }

  /**
   * Find a user pool by id, in whichever Account and Region created it.
   *
   * A pool id is unique across a simulation, as it is across real AWS, so this
   * is what the served JWKS and OpenID configuration endpoints resolve a pool
   * from: the request hostname carries the region and the path carries the id,
   * and neither says which Account owns the pool.
   */
  findUserPoolInAnyAccount(userPoolId: string): SimCognitoUserPool | undefined {
    return this.userPoolRegistry.find(userPoolId);
  }

  /**
   * Find a user pool by id.
   *
   * This is the simulator's own accessor, for tests seeding or inspecting
   * pool state without going through a Command and its authorization.
   */
  findUserPool(userPoolId: string): SimCognitoUserPool | undefined {
    return this.pools.find(userPoolId as SimCognitoUserPoolId);
  }

  /**
   * Get a user pool by id, or refuse.
   *
   * This is the simulator's own accessor too, and it is what a test reaches
   * for to hand a pool's JWKS to a token verifier.
   */
  userPool(userPoolId: string): SimCognitoUserPool {
    return this.pools.require(requireSimCognitoUserPoolId(userPoolId));
  }

  /**
   * Register a user pool the simulation is told already exists, under a chosen
   * pool id.
   *
   * `CreateUserPool` allocates its own id, as real Cognito does, and takes
   * none from you. This is for the pool something else already decided the id
   * of, such as one a CDK app creates in another stack and names in this one
   * as a literal string.
   *
   * The pool is the same thing a creation would have made. Its ARN, issuer
   * URL, `iss` claim and `ProviderName` all follow from the id, and it is in
   * the registry that serves its JWKS and OpenID configuration.
   */
  registerUserPool(
    registration: SimCognitoUserPoolRegistration,
  ): SimCognitoUserPool {
    return this.commands.registrations.userPool(registration);
  }

  /**
   * Register an app client of a pool, under a chosen client id.
   *
   * The pool is named by id and has to exist, whether it was registered or
   * created. A client id is pinned alongside the pool id it belongs to, which
   * is why this is here as well as `registerUserPool`.
   */
  registerUserPoolClient(
    registration: SimCognitoUserPoolClientRegistration,
  ): SimCognitoUserPoolClient {
    return this.commands.registrations.userPoolClient(registration);
  }

  /**
   * The web ACLs in front of this scope's pools, as a served request sees
   * them.
   *
   * The simulator's own accessor rather than a Cognito operation: a request to
   * a pool's hosted domain is served without a Command, so this is how the
   * serving layer reaches whatever a web ACL decided about it.
   */
  webAcls(): SimWafProtection {
    return this.commands.webAcls;
  }

  /**
   * Get this service's CloudFormation Resource factory.
   */
  cfnResourceFactory(): SimCognitoCfnResourceFactory {
    return this.cfnFactory;
  }

  /**
   * Get this service's SDK Command router for SDK client interception.
   */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.sdkRouter;
  }
}
