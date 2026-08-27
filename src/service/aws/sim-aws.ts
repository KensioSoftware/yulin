import {
  DEFAULT_SIM_AWS_ACCOUNT_ID,
  type SimAwsAccount,
  type SimAwsAccountId,
} from "./sim-aws-account.js";
import type {
  BackgroundCompleter,
  BackgroundScheduler,
} from "../../util/background/background.js";
import {
  type AwsRegionName,
  DEFAULT_SIM_AWS_REGION_NAME,
  type SimAwsRegion,
} from "./sim-aws-region.js";
import type { SimAwsAccountRegionContainer } from "./sim-aws-account-region-scope.js";
import { SimAwsServiceFactory } from "./factory/sim-aws-service-factory.js";
import { SimAwsScopeRegistry } from "./scope/sim-aws-scope-registry.js";
import { SimAwsServiceAccessors } from "./sim-aws-service-accessors.js";
import type { SimIamRegistry } from "../iam/registry/sim-iam-registry.js";
import type { SimOrganizations } from "../organizations/index.js";
import type { SimAwsPrincipal } from "./caller/sim-aws-caller.js";
import { simAwsRunAsContext } from "./caller/sim-aws-run-as-context.js";
import type { SimClockControl } from "../../util/clock/sim-clock-control.js";
import { SimAwsTimekeeping } from "./sim-aws-timekeeping.js";
import { SimAwsRequestAuthentication } from "./sim-aws-request-authentication.js";
import type {
  SimAwsProperties,
  SimAwsRequestCallerOptions,
} from "./sim-aws-properties.js";
import type { SimIamCredentialIdentity } from "../iam/credential/sim-aws-credentials.js";
import type { SimAwsRequestCaller } from "../iam/request/sim-aws-request-caller.js";
import {
  closeOnSignal,
  type SimCloseOnSignalOptions,
} from "../../util/process/close-on-signal.js";

/**
 * Top-level container for simulated AWS.
 * Contains Account scopes, Region scopes, Account/Region scopes, and built-in
 * simulated AWS services.
 *
 * The per-service accessors (`s3()`, `dynamoDb()` and so on) are inherited from
 * SimAwsServiceAccessors, which resolves them against the default Account
 * Region scope.
 */
export class SimAws extends SimAwsServiceAccessors {
  public readonly defaultAccountId: SimAwsAccountId;
  public readonly defaultRegionName: AwsRegionName;
  /**
   * Internal service factory used to wire simulated AWS services.
   * @internal
   */
  public readonly serviceFactory: SimAwsServiceFactory;

  /**
   * Sim IAM registry for this sim AWS instance.
   */
  public readonly iamRegistry: SimIamRegistry;

  private readonly background: BackgroundScheduler & BackgroundCompleter;
  private readonly scopes: SimAwsScopeRegistry;
  private readonly timekeeping: SimAwsTimekeeping;
  private readonly requestAuthentication: SimAwsRequestAuthentication;

  constructor(properties: SimAwsProperties = {}) {
    super();

    const {
      defaultAccountId = DEFAULT_SIM_AWS_ACCOUNT_ID,
      defaultRegionName = DEFAULT_SIM_AWS_REGION_NAME,
      clock,
      background: suppliedBackground,
    } = properties;

    const timekeeping = new SimAwsTimekeeping({
      clock,
      background: suppliedBackground,
    });
    const background = timekeeping.background;

    this.defaultAccountId = defaultAccountId as SimAwsAccountId;
    this.defaultRegionName = defaultRegionName;
    this.timekeeping = timekeeping;
    this.background = background;
    this.serviceFactory = new SimAwsServiceFactory({
      simAws: this,
      background,
    });
    this.iamRegistry = this.serviceFactory.iamRegistry;
    this.scopes = new SimAwsScopeRegistry({ simAws: this });
    this.requestAuthentication = new SimAwsRequestAuthentication({
      requestAuth: this.serviceFactory.requestAuth,
      clock: background,
    });
  }

  /**
   * Get simulated AWS Organizations for this simulated AWS environment.
   *
   * An organization spans Accounts, so this one belongs to the whole
   * simulation and is reached here rather than from an Account scope. The
   * service control policies attached through it filter what the Accounts in
   * this simulation may do, whether a request arrives through a CloudFormation
   * deployment, an intercepted SDK client, or a service call in a handler.
   *
   * ```typescript
   * simAws.organizations().attachServiceControlPolicy("123456789012", {
   *   Version: "2012-10-17",
   *   Statement: { Effect: "Deny", Action: "s3:CreateBucket", Resource: "*" },
   * });
   * ```
   */
  organizations(): SimOrganizations {
    return this.serviceFactory.organizations;
  }

  /**
   * Get the current time in this simulated AWS environment.
   *
   * Every simulated timestamp comes from here, so this is what a simulation
   * means by "now", which is not necessarily what the host clock means by it.
   */
  now(): Date {
    return this.background.now();
  }

  /**
   * Control this simulated AWS environment's clock.
   *
   * Time can be frozen, set to an instant, or advanced by a duration, so
   * behaviour that only happens once time passes — a temporary session
   * expiring, for one — can be tested without waiting for it and without
   * replacing the clock for the whole process:
   *
   * ```typescript
   * await simAws.clock().advanceBy({ minutes: 20 });
   * ```
   *
   * Advancing runs whatever falls due during the interval and returns once the
   * simulation has settled, so the next line can assert. The clock belongs to
   * this instance alone: moving it never disturbs another SimAws, or the real
   * clock.
   */
  clock(): SimClockControl {
    return this.timekeeping.clockControl();
  }

  /**
   * Verify the SigV4 signature on an HTTP request and resolve who signed it.
   *
   * This answers the question an HTTP request cannot otherwise answer: which
   * simulated principal made it. The resulting identity is what IAM
   * authorization already knows how to work with.
   *
   * Verification spans every Account, because a signature names an access key
   * and not an Account. The body is passed separately, since a request body can
   * only be read once and whoever serves the request needs the same bytes.
   *
   * Throws a SimIamSigV4Error carrying the AWS error code real AWS would use.
   */
  verifySignedRequest(
    request: Request,
    body?: Uint8Array,
  ): SimIamCredentialIdentity {
    return this.requestAuthentication.verifySignature(request, body);
  }

  /**
   * Work out which simulated principal an HTTP request is made by.
   *
   * This is the request authentication boundary every served request passes
   * through, exposed so it can be used directly. An `x-sim-aws-caller` header
   * names a principal outright, an AWS4-HMAC-SHA256 signature is verified, and
   * a request offering neither is anonymous rather than the Account root.
   *
   * The body is passed separately for the same reason it is on
   * `verifySignedRequest`: a request body can only be read once.
   */
  resolveRequestCaller(
    request: Request,
    options: SimAwsRequestCallerOptions = {},
  ): SimAwsRequestCaller {
    return this.requestAuthentication.resolveCaller(request, options);
  }

  /**
   * Get a simulated AWS Account.
   */
  account(
    accountId: SimAwsAccountId | string = this.defaultAccountId,
  ): SimAwsAccount {
    return this.scopes.account(accountId as SimAwsAccountId);
  }

  /**
   * Get a simulated AWS Account Region scope.
   */
  region(regionName: AwsRegionName = this.defaultRegionName): SimAwsRegion {
    return this.scopes.region(regionName);
  }

  /**
   * Get an Account Region scope in this simulated AWS.
   */
  accountRegionScope(
    accountId: SimAwsAccountId = this.defaultAccountId,
    regionName: AwsRegionName = this.defaultRegionName,
  ): SimAwsAccountRegionContainer {
    return this.scopes.accountRegionScope(accountId, regionName);
  }

  /**
   * The scope the inherited per-service accessors resolve against.
   */
  protected defaultAccountRegionScope(): SimAwsAccountRegionContainer {
    return this.accountRegionScope();
  }

  /**
   * Run a function with an ambient simulated caller for this SimAws instance.
   *
   * The caller is the simulated principal, such as an IAM Role, that
   * simulated AWS operations during the run are attributed to when no
   * explicit caller is given, including SDK Commands routed by interception.
   *
   * The caller is scoped to this SimAws instance, not global: each SimAws is
   * its own simulated universe, so running as a caller here never changes
   * what a different SimAws instance observes. Runs on the same instance may
   * be nested; the innermost caller wins.
   */
  async runAs<T>(caller: SimAwsPrincipal, run: () => Promise<T>): Promise<T> {
    return await simAwsRunAsContext.run(this, caller, run);
  }

  /**
   * Wait for all outstanding background tasks to complete.
   */
  async backgroundTasksComplete(): Promise<void> {
    await this.background.complete();
  }

  /**
   * Let go of everything this simulated environment is holding open.
   *
   * A watched template file and a watched mounted directory each hold an open
   * filesystem handle, which keeps the process alive. This is the one call that
   * releases all of them, in every Account and Region this simulation has
   * reached, so a script that wants to exit has one thing to wait for rather
   * than a list to keep up with. A served environment is closed by its server,
   * so a script with one of those has nothing to call here.
   *
   * Simulated state is not discarded. Every Bucket, Table and Stack is where it
   * was, and the environment goes on working: this is about the handles that
   * keep the process alive, not about resetting a simulation. Closing an
   * environment that started nothing is not an error, and closing again does
   * nothing again.
   */
  async close(): Promise<void> {
    await this.scopes.close();
  }

  /**
   * Close this simulated environment when the process is signalled.
   *
   * Nothing installs a signal handler unless it is asked to, since a library
   * taking over process signals gets in the way of whatever else the process is
   * doing. Asking looks like this:
   *
   * ```typescript
   * simAws.closeOnSignal();
   * ```
   *
   * `SIGINT` and `SIGTERM` unless other signals are named. What comes back
   * takes the handlers off again, for a script that stops wanting them before
   * the process ends.
   */
  closeOnSignal(options: SimCloseOnSignalOptions = {}): () => void {
    return closeOnSignal(async () => {
      await this.close();
    }, options);
  }
}
