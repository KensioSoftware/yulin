import type {
  BackgroundCompleter,
  BackgroundScheduler,
} from "../../../util/background/background.js";
import type { SimAwsAccountRegionContainer } from "../sim-aws-account-region-scope.js";
import type { SimAws } from "../sim-aws.js";
import type { SimAcm } from "../../acm/sim-acm.js";
import type { SimApiGateway } from "../../apigateway/index.js";
import type { SimApiGatewayV2 } from "../../apigatewayv2/index.js";
import type { SimCloudFormation } from "../../cloudformation/index.js";
import type { SimCognitoIdentityProvider } from "../../cognito/index.js";
import { SimCloudFrontRegistry } from "../../cloudfront/registry/sim-cloud-front-registry.js";
import type { SimCloudFront } from "../../cloudfront/sim-cloudfront.js";
import type { SimCloudWatch } from "../../cloudwatch/index.js";
import type { SimDynamoDb as SimDynamoDatabase } from "../../dynamodb/index.js";
import type { SimEcr } from "../../ecr/index.js";
import type { SimEcs } from "../../ecs/index.js";
import type { SimRekognition } from "../../rekognition/index.js";
import type { SimRoute53 } from "../../route53/index.js";
import type { SimS3 } from "../../s3/sim-s3.js";
import type { SimScheduler } from "../../scheduler/index.js";
import type { SimElbV2 } from "../../elbv2/index.js";
import type { SimIam } from "../../iam/index.js";
import { SimIamRegistry } from "../../iam/registry/sim-iam-registry.js";
import type { SimKms } from "../../kms/index.js";
import type { SimLambda } from "../../lambda/index.js";
import { SimLambdaUrlRegistry } from "../../lambda/registry/sim-lambda-url-registry.js";
import type { SimLogs } from "../../logs/index.js";
import type { SimSecretsManager } from "../../secretsmanager/index.js";
import type { SimEventBridge } from "../../eventbridge/index.js";
import type { SimSesV2 } from "../../ses/index.js";
import type { SimSns } from "../../sns/index.js";
import type { SimSqs } from "../../sqs/index.js";
import type { SimSsm } from "../../ssm/index.js";
import type { SimSts } from "../../sts/sim-sts.js";
import type { SimWafV2 } from "../../wafv2/index.js";
import { SimAwsAccountRegionServiceBuilder } from "./sim-aws-account-region-service-builder.js";
import { SimAwsRegisteredServiceBuilder } from "./sim-aws-registered-service-builder.js";
import { SimAwsSelfContainedServiceBuilder } from "./sim-aws-self-contained-service-builder.js";
import { SimAwsAccountServiceCache } from "./sim-aws-account-service-cache.js";
import { SimAwsRequestAuthWiring } from "./sim-aws-request-auth-wiring.js";
import { SimAwsScopedServiceRegistries } from "./sim-aws-scoped-service-registries.js";
import { SimAwsMessageLog } from "../message/sim-aws-message-log.js";

interface SimAwsServiceFactoryProperties {
  readonly simAws: SimAws;
  readonly background: BackgroundScheduler & BackgroundCompleter;
}

/**
 * Factory for simulated AWS services used by one SimAws instance.
 *
 * This class is the top-level construction boundary behind the SimAws facade.
 * It owns the collaborators shared by every scope, such as the cross-scope
 * registries and request authentication, and it decides which scope each
 * simulated service belongs to.
 *
 * That decision is all this class states, one line per service, and the two
 * collaborators it routes between are what the two answers mean. A service
 * scoped to an account, such as IAM, Route53, and CloudFront, is reused for
 * every Region in that account by SimAwsAccountServiceCache. A service scoped
 * to an account and region, such as ACM, DynamoDB, and S3, is built fresh for
 * the asking scope by SimAwsAccountRegionServiceBuilder, which is also where
 * the wiring for one of those services lives.
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
   * Shared request authentication collaborators for this simulation.
   * @internal
   */
  public readonly requestAuth = new SimAwsRequestAuthWiring({
    iamRegistry: this.iamRegistry,
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

  /**
   * The registries this simulation's scoped services share between them.
   *
   * A serving layer reaching a resource by a name that carries no scope starts
   * here: an API id in an `execute-api` hostname, a load balancer's DNS name,
   * the registry host of an image URI. Each of them resolves to the Account
   * and Region scope holding the resource.
   * @internal
   */
  public readonly registries = new SimAwsScopedServiceRegistries();

  /**
   * Where the services that would have sent a message announce one.
   *
   * Shared by every scope in this simulation, so a serving layer listens once
   * and hears the Cognito messages and text messages of all of them.
   * @internal
   */
  public readonly messageLog = new SimAwsMessageLog();

  private readonly accountServices: SimAwsAccountServiceCache;
  private readonly accountRegionServices: SimAwsAccountRegionServiceBuilder;
  private readonly registeredServices: SimAwsRegisteredServiceBuilder;
  private readonly selfContainedServices: SimAwsSelfContainedServiceBuilder;

  constructor(properties: SimAwsServiceFactoryProperties) {
    this.accountServices = new SimAwsAccountServiceCache({
      simAws: properties.simAws,
      background: properties.background,
      acmRegistry: this.registries.acm,
      cloudFrontRegistry: this.cloudFrontRegistry,
      route53Registry: this.registries.route53,
      kmsRegistry: this.registries.kms,
      // A Cognito hosted domain answers on a hostname of its own, so DNS
      // resolution asks the registry holding those domains about it.
      serviceHosts: this.registries.cognitoDomains,
      iamRegistry: this.iamRegistry,
      accessKeyRegistry: this.requestAuth.accessKeyRegistry,
    });
    this.accountRegionServices = new SimAwsAccountRegionServiceBuilder({
      simAws: properties.simAws,
      background: properties.background,
      registries: this.registries,
      iamRegistry: this.iamRegistry,
      lambdaUrlRegistry: this.lambdaUrlRegistry,
      accountServices: this.accountServices,
      messageLog: this.messageLog,
    });
    this.registeredServices = new SimAwsRegisteredServiceBuilder({
      registries: this.registries,
      accountServices: this.accountServices,
    });
    this.selfContainedServices = new SimAwsSelfContainedServiceBuilder({
      accountServices: this.accountServices,
    });
  }

  /** Create simulated ACM for an Account Region scope. */
  createAcm(scope: SimAwsAccountRegionContainer): SimAcm {
    return this.registeredServices.createAcm(scope);
  }

  /** Create simulated API Gateway REST APIs for an Account Region scope. */
  createApiGateway(scope: SimAwsAccountRegionContainer): SimApiGateway {
    return this.registeredServices.createApiGateway(scope);
  }

  /** Create simulated API Gateway v2 for an Account Region scope. */
  createApiGatewayV2(scope: SimAwsAccountRegionContainer): SimApiGatewayV2 {
    return this.registeredServices.createApiGatewayV2(scope);
  }

  /** Create simulated CloudFormation for an Account Region scope. */
  createCloudFormation(scope: SimAwsAccountRegionContainer): SimCloudFormation {
    return this.accountRegionServices.createCloudFormation(scope);
  }

  /** Create or get simulated CloudFront for an Account scope. */
  createCloudFront(scope: SimAwsAccountRegionContainer): SimCloudFront {
    return this.accountServices.createCloudFront(scope);
  }

  /** Create simulated Cognito user pools for an Account Region scope. */
  createCognitoIdentityProvider(
    scope: SimAwsAccountRegionContainer,
  ): SimCognitoIdentityProvider {
    return this.accountRegionServices.createCognitoIdentityProvider(scope);
  }

  /** Create simulated CloudWatch metrics and alarms for an Account Region scope. */
  createCloudWatch(scope: SimAwsAccountRegionContainer): SimCloudWatch {
    return this.accountRegionServices.createCloudWatch(scope);
  }

  /** Create simulated DynamoDB for an Account Region scope. */
  createDynamoDb(scope: SimAwsAccountRegionContainer): SimDynamoDatabase {
    return this.selfContainedServices.createDynamoDb(scope);
  }

  /** Create simulated ECR for an Account Region scope. */
  createEcr(scope: SimAwsAccountRegionContainer): SimEcr {
    return this.registeredServices.createEcr(scope);
  }

  /** Create simulated ECS for an Account Region scope. */
  createEcs(scope: SimAwsAccountRegionContainer): SimEcs {
    return this.accountRegionServices.createEcs(scope);
  }

  /** Create simulated EventBridge for an Account Region scope. */
  createEventBridge(scope: SimAwsAccountRegionContainer): SimEventBridge {
    return this.accountRegionServices.createEventBridge(scope);
  }

  /** Create simulated Elastic Load Balancing v2 for an Account Region scope. */
  createElbV2(scope: SimAwsAccountRegionContainer): SimElbV2 {
    return this.registeredServices.createElbV2(scope);
  }

  /** Create or get simulated IAM for an Account scope. */
  createIam(scope: SimAwsAccountRegionContainer): SimIam {
    return this.accountServices.createIam(scope);
  }

  /** Create simulated KMS for an Account Region scope. */
  createKms(scope: SimAwsAccountRegionContainer): SimKms {
    return this.registeredServices.createKms(scope);
  }

  /** Create simulated Lambda for an Account Region scope. */
  createLambda(scope: SimAwsAccountRegionContainer): SimLambda {
    return this.accountRegionServices.createLambda(scope);
  }

  /** Create simulated Rekognition for an Account Region scope. */
  createRekognition(scope: SimAwsAccountRegionContainer): SimRekognition {
    return this.accountRegionServices.createRekognition(scope);
  }

  /** Create or get simulated Route53 for an Account scope. */
  createRoute53(scope: SimAwsAccountRegionContainer): SimRoute53 {
    return this.accountServices.createRoute53(scope);
  }

  /** Create simulated S3 for an Account Region scope. */
  createS3(scope: SimAwsAccountRegionContainer): SimS3 {
    return this.accountRegionServices.createS3(scope);
  }

  /** Create simulated Secrets Manager for an Account Region scope. */
  createSecretsManager(scope: SimAwsAccountRegionContainer): SimSecretsManager {
    return this.selfContainedServices.createSecretsManager(scope);
  }

  /** Create simulated CloudWatch Logs for an Account Region scope. */
  createLogs(scope: SimAwsAccountRegionContainer): SimLogs {
    return this.accountRegionServices.createLogs(scope);
  }

  /** Create simulated EventBridge Scheduler for an Account Region scope. */
  createScheduler(scope: SimAwsAccountRegionContainer): SimScheduler {
    return this.accountRegionServices.createScheduler(scope);
  }

  /** Create simulated SES for an Account Region scope. */
  createSesV2(scope: SimAwsAccountRegionContainer): SimSesV2 {
    return this.selfContainedServices.createSesV2(scope);
  }

  /** Create simulated SNS for an Account Region scope. */
  createSns(scope: SimAwsAccountRegionContainer): SimSns {
    return this.accountRegionServices.createSns(scope);
  }

  /** Create simulated SQS for an Account Region scope. */
  createSqs(scope: SimAwsAccountRegionContainer): SimSqs {
    return this.selfContainedServices.createSqs(scope);
  }

  /** Create simulated SSM for an Account Region scope. */
  createSsm(scope: SimAwsAccountRegionContainer): SimSsm {
    return this.selfContainedServices.createSsm(scope);
  }

  /** Create simulated STS for an Account/Region scope. */
  createSts(scope: SimAwsAccountRegionContainer): SimSts {
    return this.accountRegionServices.createSts(scope);
  }

  /** Create simulated WAFv2 for an Account Region scope. */
  createWafV2(scope: SimAwsAccountRegionContainer): SimWafV2 {
    return this.accountRegionServices.createWafV2(scope);
  }
}
