import type {
  BackgroundCompleter,
  BackgroundScheduler,
} from "../../../util/background/background.js";
import type { SimAwsAccountRegionContainer } from "../sim-aws-account-region-scope.js";
import type { SimAws } from "../sim-aws.js";
import { SimAcm } from "../../acm/sim-acm.js";
import { SimApiGatewayV2 } from "../../apigatewayv2/index.js";
import { SimCognitoHttpApiJwtIssuerKeys } from "../../apigatewayv2/api/authorizer/sim-cognito-http-api-jwt-issuer-keys.js";
import { SimRoute53AcmDnsRecords } from "../../acm/validation/sim-route53-acm-dns-records.js";
import { SimCloudFormation } from "../../cloudformation/index.js";
import { SimCognitoIdentityProvider } from "../../cognito/index.js";
import { SimDynamoDb as SimDynamoDatabase } from "../../dynamodb/index.js";
import type { SimIamRegistry } from "../../iam/registry/sim-iam-registry.js";
import { SimKms } from "../../kms/index.js";
import type { SimHttpApiRegistry } from "../../apigatewayv2/registry/sim-http-api-registry.js";
import { SimLambda } from "../../lambda/index.js";
import type { SimLambdaUrlRegistry } from "../../lambda/registry/sim-lambda-url-registry.js";
import { SimSqsEventSourceQueues } from "../../lambda/event-source/queue/sim-sqs-event-source-queues.js";
import { SimDynamoDbEventSourceStreams } from "../../lambda/event-source/stream/sim-dynamodb-event-source-streams.js";
import { SimS3LambdaCodeStore } from "../../lambda/function/code/store/sim-s3-lambda-code-store.js";
import { SimSdkLambdaVmModuleProvider } from "../../lambda/function/code/vm/sdk/sim-sdk-lambda-vm-module-provider.js";
import { SimRekognition } from "../../rekognition/index.js";
import { SimAwsRekognitionImageObjects } from "../../rekognition/image/s3/sim-aws-rekognition-image-objects.js";
import { SimS3 } from "../../s3/sim-s3.js";
import { simAwsS3NotificationDestinations } from "./sim-aws-s3-notification-destinations.js";
import { SimSecretsManager } from "../../secretsmanager/index.js";
import { SimSqs } from "../../sqs/index.js";
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
  readonly httpApiRegistry: SimHttpApiRegistry;
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
  private readonly httpApiRegistry: SimHttpApiRegistry;
  private readonly accountServices: SimAwsAccountServiceCache;

  constructor(properties: SimAwsAccountRegionServiceBuilderProperties) {
    this.simAws = properties.simAws;
    this.background = properties.background;
    this.registries = properties.registries;
    this.iamRegistry = properties.iamRegistry;
    this.lambdaUrlRegistry = properties.lambdaUrlRegistry;
    this.httpApiRegistry = properties.httpApiRegistry;
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

  /**
   * Create simulated API Gateway v2 for an Account Region scope.
   *
   * HTTP APIs are Region-scoped on real AWS: the endpoint API Gateway
   * generates names the Region, and an API cannot be reached from another one.
   */
  createApiGatewayV2(scope: SimAwsAccountRegionContainer): SimApiGatewayV2 {
    return new SimApiGatewayV2({
      accountRegionScope: scope.accountRegionScope,
      iam: this.accountServices.createIam(scope),
      background: this.background,
      // API ids are unique across the simulation, and an API is reachable by
      // id alone from the serving layer, whichever scope created it.
      registry: this.httpApiRegistry,
      // A JWT authorizer verifies against user pools from any simulated
      // Account, as a real one can name a pool in any Account.
      jwtIssuerKeys: new SimCognitoHttpApiJwtIssuerKeys({
        userPoolRegistry: this.registries.cognito,
      }),
    });
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
      // Pool ids are unique across the simulation, and a pool is reachable by
      // id alone from the serving layer, whichever scope created it.
      userPoolRegistry: this.registries.cognito,
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
   *
   * Event source mappings poll the same scope's simulated SQS and DynamoDB, as
   * a queue or a table's stream can only be an event source for a function in
   * its own Account and Region.
   */
  createLambda(scope: SimAwsAccountRegionContainer): SimLambda {
    return new SimLambda({
      accountRegionScope: scope.accountRegionScope,
      iam: this.accountServices.createIam(scope),
      background: this.background,
      runAsOwner: this.simAws,
      urlRegistry: this.lambdaUrlRegistry,
      codeStore: new SimS3LambdaCodeStore({ s3: scope.s3() }),
      eventSourceQueues: new SimSqsEventSourceQueues({ sqs: scope.sqs() }),
      eventSourceStreams: new SimDynamoDbEventSourceStreams({
        dynamoDb: scope.dynamoDb(),
      }),
      vmSdkModuleProvider: new SimSdkLambdaVmModuleProvider({
        simAws: this.simAws,
        regionName: scope.accountRegionScope.regionName,
      }),
    });
  }

  /**
   * Create simulated Rekognition for an Account Region scope.
   *
   * Rekognition is Region-scoped because the results declared against it are:
   * a detection made in one Region is answered by that Region's rules. Image
   * objects come from the whole simulation rather than this scope's S3, since
   * real Rekognition reads a Bucket another Account's policy admits it to.
   */
  createRekognition(scope: SimAwsAccountRegionContainer): SimRekognition {
    return new SimRekognition({
      iam: this.accountServices.createIam(scope),
      background: this.background,
      images: new SimAwsRekognitionImageObjects({
        simAws: this.simAws,
        accountRegionScope: scope.accountRegionScope,
      }),
    });
  }

  /**
   * Create simulated S3 for an Account Region scope.
   *
   * Bucket event notification destinations are resolved when a configuration
   * is applied or an event is delivered, never here. Simulated Lambda already
   * reaches this scope's simulated S3 as it is built, for function code in a
   * Bucket, so building S3 by reaching for Lambda would be a cycle: the memo
   * only records a service once its factory has returned, and has no
   * re-entrancy guard. That holds for a service that would not close the cycle
   * today as well, since a later one could.
   */
  createS3(scope: SimAwsAccountRegionContainer): SimS3 {
    return new SimS3({
      accountRegionScope: scope.accountRegionScope,
      s3GlobalRegistry: this.registries.s3,
      iam: this.accountServices.createIam(scope),
      background: this.background,
      notificationDestinations: simAwsS3NotificationDestinations(this.simAws),
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
   * Create simulated SQS for an Account Region scope.
   *
   * Queues are Region-scoped on real AWS: a queue URL and ARN both name the
   * Region, and a queue cannot be reached from another one.
   */
  createSqs(scope: SimAwsAccountRegionContainer): SimSqs {
    return new SimSqs({
      accountRegionScope: scope.accountRegionScope,
      iam: this.accountServices.createIam(scope),
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
