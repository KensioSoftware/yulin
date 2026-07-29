import type {
  BackgroundCompleter,
  BackgroundScheduler,
} from "../../../util/background/background.js";
import type { SimAwsAccountRegionContainer } from "../sim-aws-account-region-scope.js";
import type { SimAws } from "../sim-aws.js";
import { SimAcm } from "../../acm/sim-acm.js";
import { SimRoute53AcmDnsRecords } from "../../acm/validation/sim-route53-acm-dns-records.js";
import { SimCloudFormation } from "../../cloudformation/index.js";
import { SimCognitoIdentityProvider } from "../../cognito/index.js";
import { SimDynamoDb as SimDynamoDatabase } from "../../dynamodb/index.js";
import type { SimIamRegistry } from "../../iam/registry/sim-iam-registry.js";
import { SimKms } from "../../kms/index.js";
import { SimLambda } from "../../lambda/index.js";
import type { SimLambdaUrlRegistry } from "../../lambda/registry/sim-lambda-url-registry.js";
import { SimS3LambdaCodeStore } from "../../lambda/function/code/store/sim-s3-lambda-code-store.js";
import { SimSdkLambdaVmModuleProvider } from "../../lambda/function/code/vm/sdk/sim-sdk-lambda-vm-module-provider.js";
import { SimS3 } from "../../s3/sim-s3.js";
import { SimSecretsManager } from "../../secretsmanager/index.js";
import { SimSsm } from "../../ssm/index.js";
import { SimSts } from "../../sts/sim-sts.js";
import type { SimAwsAccountServiceCache } from "./sim-aws-account-service-cache.js";
import type { SimAwsScopedServiceRegistries } from "./sim-aws-scoped-service-registries.js";

interface SimAwsAccountRegionServiceBuilderProperties {
  readonly simAws: SimAws;
  readonly background: BackgroundScheduler & BackgroundCompleter;
  readonly registries: SimAwsScopedServiceRegistries;
  readonly iamRegistry: SimIamRegistry;
  readonly lambdaUrlRegistry: SimLambdaUrlRegistry;
  readonly accountServices: SimAwsAccountServiceCache;
}

/**
 * Builder for simulated AWS services scoped to one Account and Region.
 *
 * SimAwsServiceFactory owns the top-level policy of which scope a service
 * belongs to. This class is the half of that split holding the services whose
 * AWS state is scoped to an account/region pair, as SimAwsAccountServiceCache
 * is the half holding the services scoped to a whole account.
 *
 * Nothing is cached here, which is the point of the split: a service in this
 * class is built fresh for the scope that asks for it, because on real AWS its
 * state does not cross a Region boundary. Each build method is therefore just
 * the wiring for one service, and says in its own doc comment what makes that
 * service Region-scoped.
 *
 * Services here reach account-scoped ones, IAM above all, through the same
 * account cache the factory uses, so a Region's services decide against the
 * one IAM its Account owns.
 */
export class SimAwsAccountRegionServiceBuilder {
  private readonly simAws: SimAws;
  private readonly background: BackgroundScheduler & BackgroundCompleter;
  private readonly registries: SimAwsScopedServiceRegistries;
  private readonly iamRegistry: SimIamRegistry;
  private readonly lambdaUrlRegistry: SimLambdaUrlRegistry;
  private readonly accountServices: SimAwsAccountServiceCache;

  constructor(properties: SimAwsAccountRegionServiceBuilderProperties) {
    this.simAws = properties.simAws;
    this.background = properties.background;
    this.registries = properties.registries;
    this.iamRegistry = properties.iamRegistry;
    this.lambdaUrlRegistry = properties.lambdaUrlRegistry;
    this.accountServices = properties.accountServices;
  }

  /** Create simulated ACM for an Account Region scope. */
  createAcm(scope: SimAwsAccountRegionContainer): SimAcm {
    const acm = new SimAcm({
      accountRegionScope: scope.accountRegionScope,
      iam: this.accountServices.createIam(scope),
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

  /** Create simulated CloudFormation for an Account Region scope. */
  createCloudFormation(scope: SimAwsAccountRegionContainer): SimCloudFormation {
    return new SimCloudFormation({
      simAws: this.simAws,
      accountRegionScope: scope.accountRegionScope,
      iam: this.accountServices.createIam(scope),
      background: this.background,
    });
  }

  /**
   * Create simulated Cognito user pools for an Account Region scope.
   *
   * User pools are Region-scoped on real AWS: a pool id names its Region, and
   * a pool cannot be reached from another one.
   */
  createCognitoIdentityProvider(
    scope: SimAwsAccountRegionContainer,
  ): SimCognitoIdentityProvider {
    return new SimCognitoIdentityProvider({
      accountRegionScope: scope.accountRegionScope,
      iam: this.accountServices.createIam(scope),
      background: this.background,
    });
  }

  /** Create simulated DynamoDB for an Account Region scope. */
  createDynamoDb(scope: SimAwsAccountRegionContainer): SimDynamoDatabase {
    return new SimDynamoDatabase({
      accountRegionScope: scope.accountRegionScope,
      iam: this.accountServices.createIam(scope),
      background: this.background,
    });
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
      iam: this.accountServices.createIam(scope),
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
    return new SimLambda({
      accountRegionScope: scope.accountRegionScope,
      iam: this.accountServices.createIam(scope),
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

  /** Create simulated S3 for an Account Region scope. */
  createS3(scope: SimAwsAccountRegionContainer): SimS3 {
    return new SimS3({
      accountRegionScope: scope.accountRegionScope,
      s3GlobalRegistry: this.registries.s3,
      iam: this.accountServices.createIam(scope),
      background: this.background,
    });
  }

  /**
   * Create simulated Secrets Manager for an Account Region scope, whose secret
   * values are encrypted through that same scope's simulated KMS.
   */
  createSecretsManager(scope: SimAwsAccountRegionContainer): SimSecretsManager {
    return new SimSecretsManager({
      accountRegionScope: scope.accountRegionScope,
      iam: this.accountServices.createIam(scope),
      background: this.background,
      kms: scope.kms(),
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
      iam: this.accountServices.createIam(scope),
      background: this.background,
      kms: scope.kms(),
    });
  }

  /** Create simulated STS for an Account/Region scope. */
  createSts(scope: SimAwsAccountRegionContainer): SimSts {
    this.accountServices.createIam(scope);

    return new SimSts({
      accountRegionScope: scope.accountRegionScope,
      background: this.background,
      iamResolver: this.iamRegistry,
    });
  }
}
