import type { SimAwsAccountRegionContainer } from "./sim-aws-account-region-scope.js";
import type { SimAcm } from "../acm/sim-acm.js";
import type { SimApiGatewayV2 } from "../apigatewayv2/index.js";
import type { SimCloudFormation } from "../cloudformation/index.js";
import type { SimCloudFront } from "../cloudfront/sim-cloudfront.js";
import type { SimCloudFrontKeyValueStoreApi } from "../cloudfront/sim-cloudfront-key-value-store.js";
import type { SimCognitoIdentityProvider } from "../cognito/index.js";
import type {
  SimDynamoDb as SimDynamoDatabase,
  SimDynamoDbStreams,
} from "../dynamodb/index.js";
import type { SimIam } from "../iam/index.js";
import type { SimKms } from "../kms/index.js";
import type { SimLambda } from "../lambda/index.js";
import type { SimRekognition } from "../rekognition/index.js";
import type { SimRoute53 } from "../route53/index.js";
import type { SimS3 } from "../s3/sim-s3.js";
import type { SimScheduler } from "../scheduler/index.js";
import type { SimSecretsManager } from "../secretsmanager/index.js";
import type { SimEventBridge } from "../eventbridge/index.js";
import type { SimSns } from "../sns/index.js";
import type { SimSqs } from "../sqs/index.js";
import type { SimSsm } from "../ssm/index.js";
import type { SimSts } from "../sts/sim-sts.js";

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
}
