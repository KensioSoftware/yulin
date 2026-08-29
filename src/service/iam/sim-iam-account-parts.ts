import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimArn } from "../aws/arn.js";
import type { SimAwsAccountId } from "../aws/sim-aws-account.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import type { SimAwsDefaultCaller } from "../aws/caller/sim-aws-caller.js";
import type { SimAwsAmbientCaller } from "../aws/caller/sim-aws-ambient-caller.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import { SimIamAccountAuthZ } from "./authorize/sim-iam-account-auth-z.js";
import type { SimIamInterServiceAuthZ } from "./authorize/sim-iam-inter-service-auth-z.js";
import { SimIamCommandHandlers } from "./command/sim-iam-command-handlers.js";
import { SimIamCredentialRegistry } from "./credential/sim-iam-credential-registry.js";
import {
  SimIamRandomSessionCredentialGenerator,
  type SimIamSessionCredentialGenerator,
} from "./credential/session/sim-iam-session-cred-gen.js";
import { SimIamSessionManager } from "./credential/session/sim-iam-session-manager.js";
import {
  SimIamRandomUserCredentialGenerator,
  type SimIamUserCredentialGenerator,
} from "./credential/user/sim-iam-user-credential-generator.js";
import type { SimIamManagedPolicy } from "./policy/sim-iam-policy.js";
import type { SimIamAccountResolver } from "./registry/sim-iam-account-resolver.js";
import type { SimIamServiceControlPolicyResolver } from "./authorize/scp/sim-iam-scp-resolver.js";
import type { SimIamRole, SimIamRoleName } from "./role/sim-iam-role.js";
import type { SimIamUser, SimIamUsername } from "./user/sim-iam-user.js";

export interface SimIamProperties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly background?: BackgroundScheduler;
  readonly credentialRegistry?: SimIamCredentialRegistry;
  readonly sessionCredentialGenerator?: SimIamSessionCredentialGenerator;
  readonly userCredentialGenerator?: SimIamUserCredentialGenerator;

  /**
   * The caller this simulation attributes a request naming none to.
   *
   * A SimAws passes on what it was built with. Left out, such a request is
   * decided as the Account root, which is what a standalone SimIam does.
   */
  readonly defaultCaller?: SimAwsDefaultCaller | undefined;

  /**
   * Where a request naming no caller looks before the default.
   *
   * A SimAws passes on the run-as block it is inside, if any. A standalone
   * SimIam has no run-as around it and leaves this out.
   */
  readonly ambientCaller?: SimAwsAmbientCaller | undefined;

  /**
   * Resolves the IAM of other Accounts in the same simulation.
   *
   * A cross-Account request is decided in both Accounts, so deciding one needs
   * a way to reach the caller's own Account. A standalone SimIam has no
   * simulation around it and so leaves this out.
   */
  readonly iamResolver?: SimIamAccountResolver;

  /**
   * Resolves the service control policies in force for this Account.
   *
   * Simulated Organizations supplies this when a SimAws builds IAM. A
   * standalone SimIam has no organization around it, which is the same as an
   * Account belonging to none.
   */
  readonly scpResolver?: SimIamServiceControlPolicyResolver;
}

/**
 * The state and collaborators of one simulated IAM Account.
 *
 * SimIam is the SDK-facing facade. This class is what it is a facade over: the
 * Account's stored Roles, Users and Policies, the credential registry and
 * session manager, and the authorization and command-handling collaborators
 * that work on them. Keeping the construction and defaulting rules here leaves
 * the facade as state plus delegation.
 */
export class SimIamAccountParts {
  readonly accountId: SimAwsAccountId;
  readonly background: BackgroundScheduler;
  readonly credentials: SimIamCredentialRegistry;
  readonly sessionManager: SimIamSessionManager;
  readonly accountAuthZ: SimIamAccountAuthZ;

  readonly policies = new Map<SimArn, SimIamManagedPolicy>();
  readonly roles = new Map<SimIamRoleName, SimIamRole>();
  readonly users = new Map<SimIamUsername, SimIamUser>();

  private readonly userCredentialGenerator: SimIamUserCredentialGenerator;

  constructor(properties: SimIamProperties) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      background = new BackgroundTasks(),
      sessionCredentialGenerator = new SimIamRandomSessionCredentialGenerator(),
      userCredentialGenerator = new SimIamRandomUserCredentialGenerator(),
    } = properties;

    // The scheduler is this simulation's clock, so session expiry is judged in
    // the same time as every other simulated timestamp.
    const credentialRegistry =
      properties.credentialRegistry ??
      new SimIamCredentialRegistry({ clock: background });

    this.accountId = accountRegionScope.accountId;
    this.background = background;
    this.credentials = credentialRegistry;
    this.userCredentialGenerator = userCredentialGenerator;
    this.sessionManager = new SimIamSessionManager({
      accountId: this.accountId,
      roles: this.roles,
      credentialRegistry,
      credentialGenerator: sessionCredentialGenerator,
    });
    this.accountAuthZ = new SimIamAccountAuthZ({
      accountId: this.accountId,
      policies: this.policies,
      roles: this.roles,
      users: this.users,
      credentialIdentityResolver: credentialRegistry,
      defaultCaller: properties.defaultCaller,
      ambientCaller: properties.ambientCaller,
      iamResolver: properties.iamResolver,
      scpResolver: properties.scpResolver,
    });
  }

  /**
   * Make the command handlers for this Account.
   *
   * IAM authorizes its own control-plane commands, so the handlers need the
   * service facade the commands arrive at and cannot be built before it.
   */
  commandHandlers(iam: SimIamInterServiceAuthZ): SimIamCommandHandlers {
    return new SimIamCommandHandlers({
      accountId: this.accountId,
      policies: this.policies,
      roles: this.roles,
      users: this.users,
      credentialRegistry: this.credentials,
      userCredentialGenerator: this.userCredentialGenerator,
      background: this.background,
      iam,
    });
  }
}
