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
import type { SimS3 } from "../s3/sim-s3.js";
import type { SimCloudFront } from "../cloudfront/sim-cloudfront.js";
import type { SimDynamoDb as SimDynamoDatabase } from "../dynamodb/index.js";
import type { SimCloudFormation } from "../cloudformation/index.js";
import type { SimCognitoIdentityProvider } from "../cognito/index.js";
import type { SimRoute53 } from "../route53/index.js";
import { SimAwsServiceFactory } from "./factory/sim-aws-service-factory.js";
import { SimAwsScopeRegistry } from "./scope/sim-aws-scope-registry.js";
import type { SimAcm } from "../acm/sim-acm.js";
import type { SimIam } from "../iam/index.js";
import type { SimIamRegistry } from "../iam/registry/sim-iam-registry.js";
import type { SimKms } from "../kms/index.js";
import type { SimLambda } from "../lambda/index.js";
import type { SimSecretsManager } from "../secretsmanager/index.js";
import type { SimSsm } from "../ssm/index.js";
import type { SimSts } from "../sts/sim-sts.js";
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

/**
 * Top-level container for simulated AWS.
 * Contains Account scopes, Region scopes, Account/Region scopes, and built-in
 * simulated AWS services.
 */
export class SimAws {
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

    this.defaultAccountId = defaultAccountId;
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

  /** Get simulated ACM in the default Account Region scope. */
  acm(): SimAcm {
    return this.accountRegionScope().acm();
  }

  /** Get simulated CloudFormation in the default Account Region scope. */
  cloudFormation(): SimCloudFormation {
    return this.accountRegionScope().cloudFormation();
  }

  /** Get simulated CloudFront in the default Account scope. */
  cloudFront(): SimCloudFront {
    return this.accountRegionScope().cloudFront();
  }

  /** Get simulated Cognito user pools in the default Account Region scope. */
  cognitoIdentityProvider(): SimCognitoIdentityProvider {
    return this.accountRegionScope().cognitoIdentityProvider();
  }

  /** Get simulated DynamoDB in the default Account Region scope. */
  dynamoDb(): SimDynamoDatabase {
    return this.accountRegionScope().dynamoDb();
  }

  /** Get simulated IAM in the default Account scope. */
  iam(): SimIam {
    return this.accountRegionScope().iam();
  }

  /** Get simulated KMS in the default Account Region scope. */
  kms(): SimKms {
    return this.accountRegionScope().kms();
  }

  /** Get simulated Lambda in the default Account Region scope. */
  lambda(): SimLambda {
    return this.accountRegionScope().lambda();
  }

  /** Get simulated Route53 in the default Account scope. */
  route53(): SimRoute53 {
    return this.accountRegionScope().route53();
  }

  /** Get simulated S3 in the default Account Region scope. */
  s3(): SimS3 {
    return this.accountRegionScope().s3();
  }

  /** Get simulated Secrets Manager in the default Account Region scope. */
  secretsManager(): SimSecretsManager {
    return this.accountRegionScope().secretsManager();
  }

  /** Get simulated SSM in the default Account Region scope. */
  ssm(): SimSsm {
    return this.accountRegionScope().ssm();
  }

  /** Get simulated STS in the default Account Region scope. */
  sts(): SimSts {
    return this.accountRegionScope().sts();
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
}
