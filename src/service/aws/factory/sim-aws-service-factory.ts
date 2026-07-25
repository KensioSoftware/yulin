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
import { SimS3GlobalRegistry } from "../../s3/sim-s3-global-registry.js";
import { SimAwsAccountServiceCache } from "./sim-aws-account-service-cache.js";
import { SimAcm } from "../../acm/sim-acm.js";
import { SimRoute53AcmDnsRecords } from "../../acm/validation/sim-route53-acm-dns-records.js";
import { SimAcmRegistry } from "../../acm/registry/sim-acm-registry.js";
import { SimRoute53Registry } from "../../route53/registry/sim-route53-registry.js";
import type { SimIam } from "../../iam/index.js";
import { SimIamRegistry } from "../../iam/registry/sim-iam-registry.js";
import { SimLambda } from "../../lambda/index.js";
import { SimS3LambdaCodeStore } from "../../lambda/function/code/store/sim-s3-lambda-code-store.js";
import { SimSdkLambdaVmModuleProvider } from "../../lambda/function/code/vm/sdk/sim-sdk-lambda-vm-module-provider.js";
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

  private readonly simAws: SimAws;
  private readonly background: BackgroundScheduler & BackgroundCompleter;

  /**
   * Shared simulated ACM registry.
   *
   * This indexes the account/region-scoped ACM facades created for one SimAws
   * instance, so services holding only a Certificate ARN, such as CloudFront,
   * can resolve the Certificate it names.
   */
  private readonly acmRegistry = new SimAcmRegistry();

  /**
   * Shared simulated Route53 registry.
   *
   * This owns hosted zone and DNS record state that is shared by the
   * account-scoped Route53 service instances created for one SimAws instance.
   */
  private readonly route53Registry = new SimRoute53Registry();

  /**
   * Shared simulated S3 registry.
   *
   * This tracks Bucket ownership across account and region scopes for one
   * SimAws instance, so region-scoped S3 service instances can enforce the
   * cross-region uniqueness and lookup behavior of S3 Bucket names.
   */
  private readonly s3Registry = new SimS3GlobalRegistry();

  private readonly accountServices: SimAwsAccountServiceCache;

  constructor(properties: SimAwsServiceFactoryProperties) {
    this.simAws = properties.simAws;
    this.background = properties.background;
    this.accountServices = new SimAwsAccountServiceCache({
      simAws: properties.simAws,
      background: properties.background,
      acmRegistry: this.acmRegistry,
      cloudFrontRegistry: this.cloudFrontRegistry,
      route53Registry: this.route53Registry,
      iamRegistry: this.iamRegistry,
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
        route53Registry: this.route53Registry,
      }),
    });

    this.acmRegistry.register(scope.accountRegionScope, acm);

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
      s3GlobalRegistry: this.s3Registry,
      iam,
      background: this.background,
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
