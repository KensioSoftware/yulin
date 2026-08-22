import type { SimAwsAccountRegionContainer } from "./sim-aws-account-region-scope.js";
import type { SimAcm } from "../acm/sim-acm.js";
import type { SimApiGateway } from "../apigateway/index.js";
import type { SimApiGatewayV2 } from "../apigatewayv2/index.js";
import type { SimCloudFormation } from "../cloudformation/index.js";
import type { SimCloudFront } from "../cloudfront/sim-cloudfront.js";
import type { SimCloudFrontKeyValueStoreApi } from "../cloudfront/sim-cloudfront-key-value-store.js";
import type { SimCloudWatch } from "../cloudwatch/index.js";
import type { SimCognitoIdentityProvider } from "../cognito/index.js";
import type {
  SimDynamoDb as SimDynamoDatabase,
  SimDynamoDbStreams,
} from "../dynamodb/index.js";
import type { SimEcr } from "../ecr/index.js";
import type { SimEcs } from "../ecs/index.js";
import type { SimElbV2 } from "../elbv2/index.js";
import type { SimIam } from "../iam/index.js";
import type { SimKms } from "../kms/index.js";
import type { SimLambda } from "../lambda/index.js";
import type { SimLogs } from "../logs/index.js";
import type {
  SimPersonalize,
  SimPersonalizeEvents,
  SimPersonalizeRuntime,
} from "../personalize/index.js";
import type { SimRekognition } from "../rekognition/index.js";
import type { SimRoute53 } from "../route53/index.js";
import type { SimS3 } from "../s3/sim-s3.js";
import type { SimScheduler } from "../scheduler/index.js";
import type { SimSecretsManager } from "../secretsmanager/index.js";
import type { SimEventBridge } from "../eventbridge/index.js";
import type { SimSesV2 } from "../ses/index.js";
import type { SimSns } from "../sns/index.js";
import type { SimSqs } from "../sqs/index.js";
import type { SimSsm } from "../ssm/index.js";
import type { SimSts } from "../sts/sim-sts.js";
import type { SimWafV2 } from "../wafv2/index.js";

/**
 * Per-service accessors for a default Account Region scope.
 *
 * These live here rather than on SimAws itself because the block grows by one
 * import and one accessor per simulated service, and SimAws is otherwise close
 * to the max-lines limit. Adding a simulated service edits this file, which has
 * room, and leaves SimAws alone.
 */
export abstract class SimAwsServiceAccessors {
  /**
   * The Account Region scope these accessors read simulated services from.
   */
  protected abstract defaultAccountRegionScope(): SimAwsAccountRegionContainer;

  /** Get simulated ACM in the default Account Region scope. */
  acm(): SimAcm {
    return this.defaultAccountRegionScope().acm();
  }

  /** Get simulated API Gateway REST APIs in the default Account Region scope. */
  apiGateway(): SimApiGateway {
    return this.defaultAccountRegionScope().apiGateway();
  }

  /** Get simulated API Gateway v2 in the default Account Region scope. */
  apiGatewayV2(): SimApiGatewayV2 {
    return this.defaultAccountRegionScope().apiGatewayV2();
  }

  /** Get simulated CloudFormation in the default Account Region scope. */
  cloudFormation(): SimCloudFormation {
    return this.defaultAccountRegionScope().cloudFormation();
  }

  /** Get simulated CloudFront in the default Account scope. */
  cloudFront(): SimCloudFront {
    return this.defaultAccountRegionScope().cloudFront();
  }

  /**
   * Get the simulated CloudFront key value store data API.
   */
  cloudFrontKeyValueStore(): SimCloudFrontKeyValueStoreApi {
    return this.defaultAccountRegionScope().cloudFrontKeyValueStore();
  }

  /** Get simulated CloudWatch metrics in the default Account Region scope. */
  cloudWatch(): SimCloudWatch {
    return this.defaultAccountRegionScope().cloudWatch();
  }

  /** Get simulated Cognito user pools in the default Account Region scope. */
  cognitoIdentityProvider(): SimCognitoIdentityProvider {
    return this.defaultAccountRegionScope().cognitoIdentityProvider();
  }

  /** Get simulated DynamoDB in the default Account Region scope. */
  dynamoDb(): SimDynamoDatabase {
    return this.defaultAccountRegionScope().dynamoDb();
  }

  /** Get simulated DynamoDB Streams in the default Account Region scope. */
  dynamoDbStreams(): SimDynamoDbStreams {
    return this.defaultAccountRegionScope().dynamoDbStreams();
  }

  /** Get simulated ECR in the default Account Region scope. */
  ecr(): SimEcr {
    return this.defaultAccountRegionScope().ecr();
  }

  /** Get simulated ECS in the default Account Region scope. */
  ecs(): SimEcs {
    return this.defaultAccountRegionScope().ecs();
  }

  /** Get simulated Elastic Load Balancing v2 in the default Account Region scope. */
  elbV2(): SimElbV2 {
    return this.defaultAccountRegionScope().elbV2();
  }

  /** Get simulated EventBridge in the default Account Region scope. */
  eventBridge(): SimEventBridge {
    return this.defaultAccountRegionScope().eventBridge();
  }

  /** Get simulated EventBridge Scheduler in the default Account Region scope. */
  scheduler(): SimScheduler {
    return this.defaultAccountRegionScope().scheduler();
  }

  /** Get simulated IAM in the default Account scope. */
  iam(): SimIam {
    return this.defaultAccountRegionScope().iam();
  }

  /** Get simulated KMS in the default Account Region scope. */
  kms(): SimKms {
    return this.defaultAccountRegionScope().kms();
  }

  /** Get simulated Lambda in the default Account Region scope. */
  lambda(): SimLambda {
    return this.defaultAccountRegionScope().lambda();
  }

  /** Get simulated CloudWatch Logs in the default Account Region scope. */
  logs(): SimLogs {
    return this.defaultAccountRegionScope().logs();
  }

  /** Get simulated Personalize in the default Account Region scope. */
  personalize(): SimPersonalize {
    return this.defaultAccountRegionScope().personalize();
  }

  /**
   * Get the simulated Personalize Runtime API in the default Account Region
   * scope.
   */
  personalizeRuntime(): SimPersonalizeRuntime {
    return this.defaultAccountRegionScope().personalizeRuntime();
  }

  /**
   * Get the simulated Personalize Events API in the default Account Region
   * scope.
   */
  personalizeEvents(): SimPersonalizeEvents {
    return this.defaultAccountRegionScope().personalizeEvents();
  }

  /** Get simulated Rekognition in the default Account Region scope. */
  rekognition(): SimRekognition {
    return this.defaultAccountRegionScope().rekognition();
  }

  /** Get simulated Route53 in the default Account scope. */
  route53(): SimRoute53 {
    return this.defaultAccountRegionScope().route53();
  }

  /** Get simulated S3 in the default Account Region scope. */
  s3(): SimS3 {
    return this.defaultAccountRegionScope().s3();
  }

  /** Get simulated Secrets Manager in the default Account Region scope. */
  secretsManager(): SimSecretsManager {
    return this.defaultAccountRegionScope().secretsManager();
  }

  /** Get simulated SES in the default Account Region scope. */
  sesV2(): SimSesV2 {
    return this.defaultAccountRegionScope().sesV2();
  }

  /** Get simulated SNS in the default Account Region scope. */
  sns(): SimSns {
    return this.defaultAccountRegionScope().sns();
  }

  /** Get simulated SQS in the default Account Region scope. */
  sqs(): SimSqs {
    return this.defaultAccountRegionScope().sqs();
  }

  /** Get simulated SSM in the default Account Region scope. */
  ssm(): SimSsm {
    return this.defaultAccountRegionScope().ssm();
  }

  /** Get simulated STS in the default Account Region scope. */
  sts(): SimSts {
    return this.defaultAccountRegionScope().sts();
  }

  /** Get simulated WAFv2 in the default Account Region scope. */
  wafV2(): SimWafV2 {
    return this.defaultAccountRegionScope().wafV2();
  }
}
