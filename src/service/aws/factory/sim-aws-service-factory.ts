import type {
  BackgroundCompleter,
  BackgroundScheduler,
} from "../../../util/background/background.js";
import type { SimAwsAccountRegionContainer } from "../sim-aws-account-region-scope.js";
import type { SimAws } from "../sim-aws.js";
import { SimCloudFormation } from "../../cloudformation/index.js";
import { SimCloudFrontRegistry } from "../../cloudfront/registry/sim-cloud-front-registry.js";
import type { SimCloudFront } from "../../cloudfront/sim-cloudfront.js";
import { SimDynamoDb as SimDynamoDatabase } from "../../dynamodb/index.js";
import type { SimRoute53 } from "../../route53/index.js";
import { SimS3 } from "../../s3/sim-s3.js";
import { SimAwsAccountServiceCache } from "./sim-aws-account-service-cache.js";
import { SimAwsScopedServiceRegistries } from "./sim-aws-scoped-service-registries.js";
import { SimAcm } from "../../acm/sim-acm.js";
import { SimRoute53AcmDnsRecords } from "../../acm/validation/sim-route53-acm-dns-records.js";
import type { SimIam } from "../../iam/index.js";
import { SimIamRegistry } from "../../iam/registry/sim-iam-registry.js";
import { SimIamAccessKeyRegistry } from "../../iam/registry/sim-iam-access-key-registry.js";
import { SimIamGlobalCredentialResolver } from "../../iam/registry/sim-iam-global-credential-resolver.js";
import { SimIamSigV4Verifier } from "../../iam/sigv4/sim-iam-sigv4-verifier.js";
import { SimAwsRequestCallerResolver } from "../../iam/request/sim-aws-request-caller-resolver.js";
import { SimKms } from "../../kms/index.js";
import { SimLambda } from "../../lambda/index.js";
import { SimLambdaUrlRegistry } from "../../lambda/registry/sim-lambda-url-registry.js";
import { SimS3LambdaCodeStore } from "../../lambda/function/code/store/sim-s3-lambda-code-store.js";
import { SimSdkLambdaVmModuleProvider } from "../../lambda/function/code/vm/sdk/sim-sdk-lambda-vm-module-provider.js";
import { SimSecretsManager } from "../../secretsmanager/index.js";
import { SimSsm } from "../../ssm/index.js";
import { SimSts } from "../../sts/sim-sts.js";

interface SimAwsServiceFactoryProperties {
  readonly simAws: SimAws;
  readonly background: BackgroundScheduler & BackgroundCompleter;
}

/**
 * Factory for simulated AWS services used by one SimAws instance.
 *
 * This class is the top-level construction boundary behind the SimAws facade.
 * It wires shared collaborators such as background tasks and service
 * registries, creates new account/region-scoped service instances, and
 * delegates account-scoped singleton lifetimes to SimAwsAccountServiceCache.
 *
 * SimAwsAccountServiceCache is narrower: it only caches services that should be
 * reused for an entire account. This factory decides whether a service should
 * be created fresh for the requested account/region scope, such as ACM,
 * CloudFormation, DynamoDB, and S3, or routed through that account-level cache,
 * such as IAM, Route53, and CloudFront.
 */
export class SimAwsServiceFactory {
  /**
   * Shared simulated CloudFront registry.
   *
   * This is intended for CloudFront service/controller wiring so request
   * routing uses the same registry as CloudFront SDK command handling.
   * @internal
   */
  public readonly cloudFrontRegistry = new SimCloudFrontRegistry();

  /**
   * Shared simulated IAM registry.
   *
   * This indexes the account-scoped IAM facades created for one SimAws
   * instance so cross-account services can resolve Account-owned IAM state.
   */
  public readonly iamRegistry = new SimIamRegistry();

  /**
   * Shared index of which Account owns each simulated access key.
   *
   * A SigV4 signed request names an access key but not an Account, so this is
   * what lets a signature be traced back to the IAM that issued it.
   * @internal
   */
  public readonly accessKeyRegistry = new SimIamAccessKeyRegistry();

  /**
   * Verifies SigV4 signatures made with any access key in this simulation.
   * @internal
   */
  public readonly signedRequests = new SimIamSigV4Verifier({
    credentials: new SimIamGlobalCredentialResolver({
      accessKeys: this.accessKeyRegistry,
      iam: this.iamRegistry,
    }),
  });

  /**
   * Resolves the principal behind an HTTP request into this simulation.
   *
   * This is the single request authentication boundary: everything arriving
   * over HTTP, including the in-process `SimAwsHttp.fetch()` path, gets its
   * caller from here.
   * @internal
   */
  public readonly requestCallers = new SimAwsRequestCallerResolver({
    signedRequests: this.signedRequests,
  });

  /**
   * Shared simulated Lambda Function URL registry.
   *
   * This maps Function URL ids to the Accounts that own them, so the
   * localhost serving layer can route a Function URL request to the right
   * Account/Region scope from the request hostname alone.
   * @internal
   */
  public readonly lambdaUrlRegistry = new SimLambdaUrlRegistry();

  private readonly simAws: SimAws;
  private readonly background: BackgroundScheduler & BackgroundCompleter;

  /**
   * The registries this simulation's scoped services share between them.
   */
  private readonly registries = new SimAwsScopedServiceRegistries();

  private readonly accountServices: SimAwsAccountServiceCache;

  constructor(properties: SimAwsServiceFactoryProperties) {
    this.simAws = properties.simAws;
    this.background = properties.background;
    this.accountServices = new SimAwsAccountServiceCache({
      simAws: properties.simAws,
      background: properties.background,
      acmRegistry: this.registries.acm,
      cloudFrontRegistry: this.cloudFrontRegistry,
      route53Registry: this.registries.route53,
      iamRegistry: this.iamRegistry,
      accessKeyRegistry: this.accessKeyRegistry,
    });
  }

  /**
   * Create simulated ACM for an Account Region scope.
   */
  createAcm(scope: SimAwsAccountRegionContainer): SimAcm {
    const iam = this.createIam(scope);

    const acm = new SimAcm({
      accountRegionScope: scope.accountRegionScope,
      iam,
      background: this.background,
      // Certificates validate against Hosted Zones from any simulated Account,
      // as real ACM validates against public DNS.
      dnsRecords: new SimRoute53AcmDnsRecords({
        route53Registry: this.registries.route53,
      }),
    });

    this.registries.acm.register(scope.accountRegionScope, acm);

    return acm;
  }

  /**
   * Create simulated CloudFormation for an Account Region scope.
   */
  createCloudFormation(scope: SimAwsAccountRegionContainer): SimCloudFormation {
    return new SimCloudFormation({
      simAws: this.simAws,
      accountRegionScope: scope.accountRegionScope,
      iam: this.createIam(scope),
      background: this.background,
    });
  }

  /**
   * Create or get simulated CloudFront for an Account scope.
   */
  createCloudFront(scope: SimAwsAccountRegionContainer): SimCloudFront {
    return this.accountServices.createCloudFront(scope);
  }

  /**
   * Create simulated DynamoDB for an Account Region scope.
   */
  createDynamoDb(scope: SimAwsAccountRegionContainer): SimDynamoDatabase {
    const iam = this.createIam(scope);

    return new SimDynamoDatabase({
      accountRegionScope: scope.accountRegionScope,
      iam,
      background: this.background,
    });
  }

  /**
   * Create or get simulated IAM for an Account scope.
   */
  createIam(scope: SimAwsAccountRegionContainer): SimIam {
    return this.accountServices.createIam(scope);
  }

  /**
   * Create simulated KMS for an Account Region scope.
   *
   * KMS keys are Region-scoped on real AWS: a key ARN names its Region, and a
   * ciphertext produced in one Region cannot be decrypted in another.
   */
  createKms(scope: SimAwsAccountRegionContainer): SimKms {
    return new SimKms({
      accountRegionScope: scope.accountRegionScope,
      iam: this.createIam(scope),
      background: this.background,
    });
  }

  /**
   * Create simulated Lambda for an Account Region scope.
   *
   * S3-located function code is fetched from the same Account/Region scope's
   * simulated S3, as real Lambda requires same-region code buckets. Function
   * code running in the vm runtime is provided host-installed AWS SDK
   * packages intercepted into this SimAws, as the real Lambda runtime
   * provides the SDK.
   */
  createLambda(scope: SimAwsAccountRegionContainer): SimLambda {
    const iam = this.createIam(scope);

    return new SimLambda({
      accountRegionScope: scope.accountRegionScope,
      iam,
      background: this.background,
      runAsOwner: this.simAws,
      urlRegistry: this.lambdaUrlRegistry,
      codeStore: new SimS3LambdaCodeStore({ s3: scope.s3() }),
      vmSdkModuleProvider: new SimSdkLambdaVmModuleProvider({
        simAws: this.simAws,
        regionName: scope.accountRegionScope.regionName,
      }),
    });
  }

  /**
   * Create or get simulated Route53 for an Account scope.
   */
  createRoute53(scope: SimAwsAccountRegionContainer): SimRoute53 {
    return this.accountServices.createRoute53(scope);
  }

  /**
   * Create simulated S3 for an Account Region scope.
   */
  createS3(scope: SimAwsAccountRegionContainer): SimS3 {
    const iam = this.createIam(scope);

    return new SimS3({
      accountRegionScope: scope.accountRegionScope,
      s3GlobalRegistry: this.registries.s3,
      iam,
      background: this.background,
    });
  }

  /**
   * Create simulated Secrets Manager for an Account Region scope.
   *
   * Secrets are Region-scoped on real AWS: a secret name is unique within one
   * Account and Region rather than globally.
   */
  createSecretsManager(scope: SimAwsAccountRegionContainer): SimSecretsManager {
    return new SimSecretsManager({
      accountRegionScope: scope.accountRegionScope,
      iam: this.createIam(scope),
      background: this.background,
    });
  }

  /**
   * Create simulated SSM for an Account Region scope.
   *
   * Parameters are Region-scoped on real AWS: a parameter name is unique
   * within one Account and Region, and its ARN names the Region. SecureString
   * values are encrypted through that same scope's simulated KMS.
   */
  createSsm(scope: SimAwsAccountRegionContainer): SimSsm {
    return new SimSsm({
      accountRegionScope: scope.accountRegionScope,
      iam: this.createIam(scope),
      background: this.background,
      kms: scope.kms(),
    });
  }

  /**
   * Create simulated STS for an Account/Region scope.
   */
  createSts(scope: SimAwsAccountRegionContainer): SimSts {
    this.createIam(scope);

    return new SimSts({
      accountRegionScope: scope.accountRegionScope,
      background: this.background,
      iamResolver: this.iamRegistry,
    });
  }
}
