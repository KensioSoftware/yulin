import {
  DEFAULT_SIM_AWS_ACCOUNT_ID,
  type SimAwsAccount,
  type SimAwsAccountId,
} from "./sim-aws-account.js";
import {
  type BackgroundCompleter,
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import {
  type AwsRegionName,
  DEFAULT_SIM_AWS_REGION_NAME,
  type SimAwsRegion,
} from "./sim-aws-region.js";
import type { SimAwsAccountRegionContainer } from "./sim-aws-account-region-scope.js";
import type { SimS3 } from "../s3/sim-s3.js";
import type { SimCloudFront } from "../cloudfront/sim-cloudfront.js";
import type { SimCloudFrontRegistry } from "../cloudfront/registry/sim-cloud-front-registry.js";
import type { SimLambdaUrlRegistry } from "../lambda/registry/sim-lambda-url-registry.js";
import type { SimDynamoDb as SimDynamoDatabase } from "../dynamodb/index.js";
import type { SimCloudFormation } from "../cloudformation/index.js";
import type { SimRoute53 } from "../route53/index.js";
import { SimAwsServiceFactory } from "./factory/sim-aws-service-factory.js";
import { SimAwsScopeRegistry } from "./scope/sim-aws-scope-registry.js";
import type { SimAcm } from "../acm/sim-acm.js";
import type { SimIam } from "../iam/index.js";
import type { SimIamRegistry } from "../iam/registry/sim-iam-registry.js";
import type { SimLambda } from "../lambda/index.js";
import type { SimSts } from "../sts/sim-sts.js";
import type { SimAwsPrincipal } from "./caller/sim-aws-caller.js";
import { simAwsRunAsContext } from "./caller/sim-aws-run-as-context.js";
import type { SimClock } from "../../util/clock/sim-clock.js";
import type { SimIamCredentialIdentity } from "../iam/credential/sim-aws-credentials.js";
import { simIamSigV4SignedRequest } from "../iam/sigv4/sim-iam-sigv4-signed-request.js";

interface SimAwsProperties {
  readonly defaultAccountId?: SimAwsAccountId;
  readonly defaultRegionName?: AwsRegionName;
  readonly background?: BackgroundScheduler & BackgroundCompleter;
  /**
   * Clock supplying this simulation's timestamps, defaulting to the real system
   * clock. Ignored when an already-built background scheduler is supplied, as
   * that scheduler carries its own clock.
   */
  readonly clock?: SimClock;
}

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

  constructor(properties: SimAwsProperties = {}) {
    const {
      defaultAccountId = DEFAULT_SIM_AWS_ACCOUNT_ID,
      defaultRegionName = DEFAULT_SIM_AWS_REGION_NAME,
      clock,
    } = properties;

    const background =
      properties.background ??
      new BackgroundTasks(clock === undefined ? {} : { clock });

    this.defaultAccountId = defaultAccountId;
    this.defaultRegionName = defaultRegionName;
    this.background = background;
    this.serviceFactory = new SimAwsServiceFactory({
      simAws: this,
      background,
    });
    this.iamRegistry = this.serviceFactory.iamRegistry;
    this.scopes = new SimAwsScopeRegistry({ simAws: this });
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
    return this.serviceFactory.signedRequests.verify(
      simIamSigV4SignedRequest(request, body),
    );
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
   * Get simulated ACM in the default Account Region scope.
   */
  acm(): SimAcm {
    return this.accountRegionScope().acm();
  }

  /**
   * Get simulated CloudFormation in the default Account Region scope.
   */
  cloudFormation(): SimCloudFormation {
    return this.accountRegionScope().cloudFormation();
  }

  /**
   * Get simulated CloudFront in the default Account scope.
   */
  cloudFront(): SimCloudFront {
    return this.accountRegionScope().cloudFront();
  }

  /**
   * Get simulated DynamoDB in the default Account Region scope.
   */
  dynamoDb(): SimDynamoDatabase {
    return this.accountRegionScope().dynamoDb();
  }

  /**
   * Get simulated IAM in the default Account scope.
   */
  iam(): SimIam {
    return this.accountRegionScope().iam();
  }

  /**
   * Get simulated Lambda in the default Account Region scope.
   */
  lambda(): SimLambda {
    return this.accountRegionScope().lambda();
  }

  /**
   * Get simulated Route53 in the default Account scope.
   */
  route53(): SimRoute53 {
    return this.accountRegionScope().route53();
  }

  /**
   * Get simulated S3 in the default Account Region scope.
   */
  s3(): SimS3 {
    return this.accountRegionScope().s3();
  }

  /**
   * Get simulated STS in the default Account Region scope.
   */
  sts(): SimSts {
    return this.accountRegionScope().sts();
  }

  /**
   * Get the shared simulated CloudFront registry.
   *
   * This is intended for CloudFront service/controller wiring so request routing
   * uses the same registry as CloudFront SDK command handling.
   * @internal
   */
  cloudFrontRegistry(): SimCloudFrontRegistry {
    return this.serviceFactory.cloudFrontRegistry;
  }

  /**
   * Get the shared simulated Lambda Function URL registry.
   *
   * This is intended for Lambda controller wiring, so serving a Function URL
   * request resolves the owning Account from the same registry the Function
   * URL commands register ids in.
   * @internal
   */
  lambdaUrlRegistry(): SimLambdaUrlRegistry {
    return this.serviceFactory.lambdaUrlRegistry;
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
