import type { SimClock } from "../../../util/clock/sim-clock.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimIamInterServiceAuthZ } from "../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimCognitoUserPoolClientFactory } from "../user-pool/client/sim-cognito-user-pool-client-factory.js";
import { SimCognitoGroupFactory } from "../user-pool/group/sim-cognito-group-factory.js";
import { SimCognitoRegistrations } from "../user-pool/sim-cognito-registrations.js";
import { SimCognitoUserPoolFactory } from "../user-pool/sim-cognito-user-pool-factory.js";
import type { SimCognitoUserPoolStore } from "../user-pool/sim-cognito-user-pool-store.js";
import type { SimAwsMessageLog } from "../../aws/message/sim-aws-message-log.js";
import type { SimCloudWatchServiceWriter } from "../../cloudwatch/write/sim-cloudwatch-service-writer.js";
import { SimCognitoPoolMetrics } from "../metric/sim-cognito-pool-metrics.js";
import { SimCognitoPoolMessenger } from "../user-pool/message/sim-cognito-pool-messenger.js";
import type { SimCognitoEmailSenders } from "../user-pool/message/sim-cognito-email-senders.js";
import { SimCognitoPoolEmailDelivery } from "../user-pool/message/sim-cognito-pool-email-delivery.js";
import type { SimCognitoTriggerFunctions } from "../user-pool/trigger/sim-cognito-trigger-functions.js";
import { SimCognitoUserPoolTriggers } from "../user-pool/trigger/sim-cognito-user-pool-triggers.js";
import { SimCognitoUserFactory } from "../user-pool/user/sim-cognito-user-factory.js";
import type { SimCognitoDomainRegistry } from "../registry/sim-cognito-domain-registry.js";
import type { SimWafProtection } from "../../wafv2/association/sim-waf-protection.js";
import { SimCognitoTokenIssuer } from "../user-pool/token/sim-cognito-token-issuer.js";
import { SimCognitoAuthCommands } from "./auth/sim-cognito-auth-commands.js";
import { SimCognitoDomainCommands } from "./domain/sim-cognito-domain-commands.js";
import { SimCognitoHostedCommands } from "./hosted/sim-cognito-hosted-commands.js";
import { SimCognitoIdentityProviderCommands } from "./idp/sim-cognito-identity-provider-commands.js";
import { SimCognitoAuthResolver } from "./auth/sim-cognito-auth-resolver.js";
import { SimCognitoFirstFactorChallenge } from "./auth/sim-cognito-first-factor-challenge.js";
import { SimCognitoAuthorizer } from "./authorize/sim-cognito-authorizer.js";
import { SimCognitoListUserPoolClients } from "./client/sim-cognito-list-user-pool-clients.js";
import { SimCognitoGroupCommands } from "./group/sim-cognito-group-commands.js";
import { SimCognitoGroupMembershipCommands } from "./group/sim-cognito-group-membership-commands.js";
import { SimCognitoListGroups } from "./group/sim-cognito-list-groups.js";
import { SimCognitoUserPoolClientCommands } from "./client/sim-cognito-user-pool-client-commands.js";
import { SimCognitoListUsers } from "./user/sim-cognito-list-users.js";
import { SimCognitoPasswordResetCommands } from "./user/sim-cognito-password-reset-commands.js";
import { SimCognitoConfirmSignUpCommands } from "./user/sim-cognito-confirm-sign-up-commands.js";
import { SimCognitoSignUpCommands } from "./user/sim-cognito-sign-up-commands.js";
import { SimCognitoTokenUser } from "./user/sim-cognito-token-user.js";
import { SimCognitoUserCommands } from "./user/sim-cognito-user-commands.js";
import { SimCognitoUserMfaCommands } from "./user/sim-cognito-user-mfa-commands.js";
import { SimCognitoWebAuthnCommands } from "./user/sim-cognito-web-authn-commands.js";
import { SimCognitoRequestResolver } from "./sim-cognito-request-resolver.js";
import { SimCognitoUserUpdateCommands } from "./user/sim-cognito-user-update-commands.js";
import { SimCognitoListUserPools } from "./user-pool/sim-cognito-list-user-pools.js";
import { SimCognitoUserPoolCommands } from "./user-pool/sim-cognito-user-pool-commands.js";
import { SimCognitoUserPoolMfaCommands } from "./user-pool/sim-cognito-user-pool-mfa-commands.js";

interface SimCognitoCommandsProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly iam: SimIamInterServiceAuthZ;
  readonly clock: SimClock;
  readonly pools: SimCognitoUserPoolStore;
  readonly domains: SimCognitoDomainRegistry;
  readonly triggerFunctions: SimCognitoTriggerFunctions;
  readonly emailSenders: SimCognitoEmailSenders;
  readonly webAcls: SimWafProtection;
  readonly messageLog: SimAwsMessageLog;

  /** Where this scope's `AWS/Cognito` metrics go, if anywhere. */
  readonly metrics?: SimCloudWatchServiceWriter | undefined;
}

/**
 * The command handlers of one simulated Cognito scope.
 *
 * They share an authorizer, a pool store and a clock, so they are built
 * together here rather than in the service facade, which is left as
 * delegation.
 */
export class SimCognitoCommands {
  public readonly userPools: SimCognitoUserPoolCommands;
  public readonly userPoolMfa: SimCognitoUserPoolMfaCommands;
  public readonly listUserPools: SimCognitoListUserPools;
  public readonly clients: SimCognitoUserPoolClientCommands;
  public readonly listClients: SimCognitoListUserPoolClients;
  public readonly users: SimCognitoUserCommands;
  public readonly userMfa: SimCognitoUserMfaCommands;
  public readonly webAuthn: SimCognitoWebAuthnCommands;
  public readonly signUp: SimCognitoSignUpCommands;
  public readonly confirmSignUp: SimCognitoConfirmSignUpCommands;
  public readonly passwordReset: SimCognitoPasswordResetCommands;
  public readonly userUpdates: SimCognitoUserUpdateCommands;
  public readonly listUsers: SimCognitoListUsers;
  public readonly groups: SimCognitoGroupCommands;
  public readonly groupMembership: SimCognitoGroupMembershipCommands;
  public readonly listGroups: SimCognitoListGroups;
  public readonly auth: SimCognitoAuthCommands;
  public readonly domains: SimCognitoDomainCommands;
  public readonly identityProviders: SimCognitoIdentityProviderCommands;
  public readonly hosted: SimCognitoHostedCommands;

  /**
   * The pools and app clients this simulation is told already exist, which no
   * AWS operation creates.
   */
  public readonly registrations: SimCognitoRegistrations;

  /**
   * The web ACLs in front of this scope's pools. Held here because a request
   * to a hosted domain reaches it without a Command, the way a fronting
   * service reaches AWS WAF.
   */
  public readonly webAcls: SimWafProtection;

  constructor(properties: SimCognitoCommandsProperties) {
    const {
      accountRegionScope,
      iam,
      clock,
      pools,
      domains,
      triggerFunctions,
      emailSenders,
    } = properties;

    this.webAcls = properties.webAcls;

    const authorizer = new SimCognitoAuthorizer({ iam, accountRegionScope });
    const resolver = new SimCognitoRequestResolver({ pools, authorizer });
    const poolMetrics = new SimCognitoPoolMetrics({
      metrics: properties.metrics,
    });
    const authResolver = new SimCognitoAuthResolver({
      resolver,
      pools,
      poolMetrics,
    });
    const userFactory = new SimCognitoUserFactory({ clock });
    // One trigger runner serves every command, because a pool's LambdaConfig
    // is one set of functions whichever operation reaches it.
    const triggers = new SimCognitoUserPoolTriggers({
      functions: triggerFunctions,
    });
    // The messages a pool would have sent are recorded by the sign-up and user
    // commands alike, and both run the pool's CustomMessage trigger first.
    const messenger = new SimCognitoPoolMessenger({
      triggers,
      email: new SimCognitoPoolEmailDelivery({ senders: emailSenders }),
      clock,
      messageLog: properties.messageLog,
    });
    // One token issuer serves the API sign-ins and the hosted endpoints, so a
    // token is the same thing however the user reached it.
    const tokenIssuer = new SimCognitoTokenIssuer({ clock, triggers });
    // The operations a signed-in user performs on itself name no pool at all:
    // the access token is what says which pool the request is for.
    const tokenUser = new SimCognitoTokenUser({ pools, clock });
    // A USER_AUTH sign-in and a hosted one both ask for a passkey, and the
    // challenge is the same one either way, so they share the issuer.
    const firstFactor = new SimCognitoFirstFactorChallenge({ clock });

    // One factory each serves the create commands and the registrations, so a
    // pool the simulation is told about is built the same way as one it made.
    const poolFactory = new SimCognitoUserPoolFactory({
      accountRegionScope,
      pools,
      clock,
    });
    const clientFactory = new SimCognitoUserPoolClientFactory({ clock });

    this.userPools = new SimCognitoUserPoolCommands({
      pools,
      poolFactory,
      authorizer,
      webAcls: properties.webAcls,
    });
    this.userPoolMfa = new SimCognitoUserPoolMfaCommands({ pools, authorizer });
    this.listUserPools = new SimCognitoListUserPools({ pools, authorizer });
    this.clients = new SimCognitoUserPoolClientCommands({
      pools,
      clientFactory,
      authorizer,
    });
    this.registrations = new SimCognitoRegistrations({
      regionName: accountRegionScope.regionName,
      pools,
      poolFactory,
      clientFactory,
    });
    this.listClients = new SimCognitoListUserPoolClients({ pools, authorizer });
    this.users = new SimCognitoUserCommands({
      poolMetrics,
      resolver,
      tokenUser,
      userFactory,
      triggers,
      messenger,
    });
    this.userMfa = new SimCognitoUserMfaCommands({
      resolver,
      tokenUser,
      clock,
    });
    this.webAuthn = new SimCognitoWebAuthnCommands({ tokenUser, clock });
    this.signUp = new SimCognitoSignUpCommands({
      poolMetrics,
      authResolver,
      userFactory,
      triggers,
      messenger,
    });
    this.confirmSignUp = new SimCognitoConfirmSignUpCommands({
      authResolver,
      resolver,
      triggers,
      messenger,
    });
    this.passwordReset = new SimCognitoPasswordResetCommands({
      authResolver,
      resolver,
      triggers,
      messenger,
    });
    this.userUpdates = new SimCognitoUserUpdateCommands({ resolver });
    this.listUsers = new SimCognitoListUsers({ resolver });
    this.groups = new SimCognitoGroupCommands({
      resolver,
      groupFactory: new SimCognitoGroupFactory({ clock }),
    });
    this.groupMembership = new SimCognitoGroupMembershipCommands({ resolver });
    this.listGroups = new SimCognitoListGroups({ resolver });
    this.auth = new SimCognitoAuthCommands({
      resolver,
      authResolver,
      pools,
      clock,
      triggers,
      tokenIssuer,
      messenger,
      firstFactor,
      poolMetrics,
    });
    this.domains = new SimCognitoDomainCommands({
      pools,
      domains,
      authorizer,
      accountRegionScope,
    });
    this.identityProviders = new SimCognitoIdentityProviderCommands({
      resolver,
      clock,
    });
    // The hosted endpoints issue the same tokens the API sign-ins issue, and
    // create pool users the same way a sign-up does, so they are given the
    // same collaborators rather than ones of their own.
    this.hosted = new SimCognitoHostedCommands({
      poolMetrics,
      tokenIssuer,
      userFactory,
      triggers,
      challenge: firstFactor,
      clock,
    });
  }
}
