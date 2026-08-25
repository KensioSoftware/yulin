import type { SimAwsAccount, SimAwsAccountId } from "./sim-aws-account.js";
import type { AwsRegionName, SimAwsRegion } from "./sim-aws-region.js";
import { Memo } from "../../util/memo/memo.js";
import { isSimAwsClosing } from "./sim-aws-closing.js";
import { SimAws } from "./sim-aws.js";
import type { SimBedrock } from "../bedrock/index.js";
import type { SimS3 } from "../s3/sim-s3.js";
import type { SimScheduler } from "../scheduler/index.js";
import type { SimCloudFront } from "../cloudfront/sim-cloudfront.js";
import type { SimCloudFrontKeyValueStoreApi } from "../cloudfront/sim-cloudfront-key-value-store.js";
import type { SimCloudWatch } from "../cloudwatch/index.js";
import type {
  SimDynamoDb as SimDynamoDatabase,
  SimDynamoDbStreams,
} from "../dynamodb/index.js";
import type { SimCloudFormation } from "../cloudformation/index.js";
import type { SimEcr } from "../ecr/index.js";
import type { SimEcs } from "../ecs/index.js";
import type { SimEventBridge } from "../eventbridge/index.js";
import type { SimCognitoIdentityProvider } from "../cognito/index.js";
import type {
  SimPersonalize,
  SimPersonalizeEvents,
  SimPersonalizeRuntime,
} from "../personalize/index.js";
import type { SimRekognition } from "../rekognition/index.js";
import type { SimRoute53 } from "../route53/index.js";
import type { SimAcm } from "../acm/sim-acm.js";
import type { SimApiGateway } from "../apigateway/index.js";
import type { SimApiGatewayV2 } from "../apigatewayv2/index.js";
import type { SimElbV2 } from "../elbv2/index.js";
import type { SimIam } from "../iam/index.js";
import type { SimFirehose } from "../firehose/index.js";
import type { SimGlue } from "../glue/index.js";
import type { SimKinesis } from "../kinesis/index.js";
import type { SimStepFunctions } from "../stepfunctions/index.js";
import type { SimKms } from "../kms/index.js";
import type { SimLambda } from "../lambda/index.js";
import type { SimLogs } from "../logs/index.js";
import type { SimSecretsManager } from "../secretsmanager/index.js";
import type { SimSesV2 } from "../ses/index.js";
import type { SimSns } from "../sns/index.js";
import type { SimSqs } from "../sqs/index.js";
import type { SimSsm } from "../ssm/index.js";
import type { SimSts } from "../sts/sim-sts.js";
import type { SimWafV2 } from "../wafv2/index.js";

export type SimAccountRegionScopeKey = `${SimAwsAccountId}:${AwsRegionName}`;

interface SimAwsAccountRegionContainerProperties {
  readonly simAws?: SimAws;
  readonly account?: SimAwsAccount;
  readonly region?: SimAwsRegion;
}

/**
 * Combined simulated AWS Account and Region scope.
 * This is the real Account/Region scope container for simulated services.
 */
export class SimAwsAccountRegionContainer {
  public readonly account: SimAwsAccount;
  public readonly region: SimAwsRegion;
  public readonly accountRegionScope: SimAwsAccountRegionScope;

  private readonly simAws: SimAws;
  private readonly memo = new Memo<object>();

  constructor(properties: SimAwsAccountRegionContainerProperties = {}) {
    const { simAws = new SimAws(), account, region } = properties;

    this.simAws = simAws;
    this.account =
      account ??
      this.simAws.account((account as SimAwsAccount | undefined)?.accountId);
    this.region =
      region ??
      this.simAws.region((region as SimAwsRegion | undefined)?.regionName);

    this.accountRegionScope = {
      accountId: this.account.accountId,
      regionName: this.region.regionName,
    };
  }

  /** Get simulated ACM for this account and region. */
  acm(): SimAcm {
    return this.memo.getOrCreate("acm", () => this.factory.createAcm(this));
  }

  /** Get simulated Bedrock for this account and region. */
  bedrock(): SimBedrock {
    return this.memo.getOrCreate("bedrock", () =>
      this.factory.createBedrock(this),
    );
  }

  /** Get simulated API Gateway REST APIs for this account and region. */
  apiGateway(): SimApiGateway {
    return this.memo.getOrCreate("apiGateway", () =>
      this.factory.createApiGateway(this),
    );
  }

  /** Get simulated API Gateway v2 for this account and region. */
  apiGatewayV2(): SimApiGatewayV2 {
    return this.memo.getOrCreate("apiGatewayV2", () =>
      this.factory.createApiGatewayV2(this),
    );
  }

  /** Get simulated CloudFormation for this account and region. */
  cloudFormation(): SimCloudFormation {
    return this.memo.getOrCreate("cloudFormation", () =>
      this.factory.createCloudFormation(this),
    );
  }

  /** Get simulated CloudFront for this account. */
  cloudFront(): SimCloudFront {
    return this.memo.getOrCreate("cloudFront", () =>
      this.factory.createCloudFront(this),
    );
  }

  /**
   * Get the simulated CloudFront key value store data API for this account.
   *
   * It is not made here, unlike the services around it. The stores it reads
   * and writes are the ones this scope's CloudFront owns, so it belongs to
   * that service and is reached through it.
   */
  cloudFrontKeyValueStore(): SimCloudFrontKeyValueStoreApi {
    return this.cloudFront().keyValueStoreApi();
  }

  /** Get simulated CloudWatch metrics for this account and region. */
  cloudWatch(): SimCloudWatch {
    return this.memo.getOrCreate("cloudWatch", () =>
      this.factory.createCloudWatch(this),
    );
  }

  /** Get simulated Cognito user pools for this account and region. */
  cognitoIdentityProvider(): SimCognitoIdentityProvider {
    return this.memo.getOrCreate("cognitoIdentityProvider", () =>
      this.factory.createCognitoIdentityProvider(this),
    );
  }

  /** Get simulated DynamoDB for this account and region. */
  dynamoDb(): SimDynamoDatabase {
    return this.memo.getOrCreate("dynamoDb", () =>
      this.factory.createDynamoDb(this),
    );
  }

  /**
   * Get simulated DynamoDB Streams for this account and region.
   *
   * It is not made here, unlike the services around it. The streams it reads
   * are the ones this scope's DynamoDB tables captured onto, so it belongs to
   * that service and is reached through it.
   */
  dynamoDbStreams(): SimDynamoDbStreams {
    return this.dynamoDb().streams();
  }

  /** Get simulated ECR for this account and region. */
  ecr(): SimEcr {
    return this.memo.getOrCreate("ecr", () => this.factory.createEcr(this));
  }

  /** Get simulated ECS for this account and region. */
  ecs(): SimEcs {
    return this.memo.getOrCreate("ecs", () => this.factory.createEcs(this));
  }

  /** Get simulated EventBridge for this account and region. */
  eventBridge(): SimEventBridge {
    return this.memo.getOrCreate("eventBridge", () =>
      this.factory.createEventBridge(this),
    );
  }

  /** Get simulated EventBridge Scheduler for this account and region. */
  scheduler(): SimScheduler {
    return this.memo.getOrCreate("scheduler", () =>
      this.factory.createScheduler(this),
    );
  }

  /** Get simulated Elastic Load Balancing v2 for this account and region. */
  elbV2(): SimElbV2 {
    return this.memo.getOrCreate("elbV2", () => this.factory.createElbV2(this));
  }

  /** Get simulated IAM for this account. */
  iam(): SimIam {
    return this.memo.getOrCreate("iam", () => this.factory.createIam(this));
  }

  /** Get simulated Glue for this account and region. */
  glue(): SimGlue {
    return this.memo.getOrCreate("glue", () => this.factory.createGlue(this));
  }

  /** Get simulated Kinesis Data Firehose for this account and region. */
  firehose(): SimFirehose {
    return this.memo.getOrCreate("firehose", () =>
      this.factory.createFirehose(this),
    );
  }

  /** Get simulated Kinesis Data Streams for this account and region. */
  kinesis(): SimKinesis {
    return this.memo.getOrCreate("kinesis", () =>
      this.factory.createKinesis(this),
    );
  }

  /** Get simulated Step Functions for this account and region. */
  stepFunctions(): SimStepFunctions {
    return this.memo.getOrCreate("stepFunctions", () =>
      this.factory.createStepFunctions(this),
    );
  }

  /** Get simulated KMS for this account and region. */
  kms(): SimKms {
    return this.memo.getOrCreate("kms", () => this.factory.createKms(this));
  }

  /** Get simulated Lambda for this account and region. */
  lambda(): SimLambda {
    return this.memo.getOrCreate("lambda", () =>
      this.factory.createLambda(this),
    );
  }

  /** Get simulated Personalize for this account and region. */
  personalize(): SimPersonalize {
    return this.memo.getOrCreate("personalize", () =>
      this.factory.createPersonalize(this),
    );
  }

  /**
   * Get the simulated Personalize Runtime API for this account and region.
   *
   * It is not made here, unlike the services around it. The campaigns it
   * answers for are the ones this scope's Personalize holds, so it belongs to
   * that service and is reached through it.
   */
  personalizeRuntime(): SimPersonalizeRuntime {
    return this.personalize().runtime();
  }

  /**
   * Get the simulated Personalize Events API for this account and region.
   *
   * Reached through this scope's Personalize, as the runtime API is. The event
   * trackers it accepts interactions for belong to that service.
   */
  personalizeEvents(): SimPersonalizeEvents {
    return this.personalize().events();
  }

  /** Get simulated Rekognition for this account and region. */
  rekognition(): SimRekognition {
    return this.memo.getOrCreate("rekognition", () =>
      this.factory.createRekognition(this),
    );
  }

  /** Get simulated Route53 for this account. */
  route53(): SimRoute53 {
    return this.memo.getOrCreate("route53", () =>
      this.factory.createRoute53(this),
    );
  }

  /** Get simulated S3 for this account and region. */
  s3(): SimS3 {
    return this.memo.getOrCreate("s3", () => this.factory.createS3(this));
  }

  /** Get simulated CloudWatch Logs for this account and region. */
  logs(): SimLogs {
    return this.memo.getOrCreate("logs", () => this.factory.createLogs(this));
  }

  /** Get simulated Secrets Manager for this account and region. */
  secretsManager(): SimSecretsManager {
    return this.memo.getOrCreate("secretsManager", () =>
      this.factory.createSecretsManager(this),
    );
  }

  /** Get simulated SES for this account and region. */
  sesV2(): SimSesV2 {
    return this.memo.getOrCreate("sesV2", () => this.factory.createSesV2(this));
  }

  /** Get simulated SNS for this account and region. */
  sns(): SimSns {
    return this.memo.getOrCreate("sns", () => this.factory.createSns(this));
  }

  /** Get simulated SQS for this account and region. */
  sqs(): SimSqs {
    return this.memo.getOrCreate("sqs", () => this.factory.createSqs(this));
  }

  /** Get simulated SSM for this account and region. */
  ssm(): SimSsm {
    return this.memo.getOrCreate("ssm", () => this.factory.createSsm(this));
  }

  /** Get simulated STS for this account and region. */
  sts(): SimSts {
    return this.memo.getOrCreate("sts", () => this.factory.createSts(this));
  }

  /** Get simulated WAFv2 for this account and region. */
  wafV2(): SimWafV2 {
    return this.memo.getOrCreate("wafV2", () => this.factory.createWafV2(this));
  }

  /**
   * Let go of everything the services in this scope are holding open.
   *
   * Whatever this scope has made that closes is closed, so a service that
   * starts holding a file or directory watch is let go of here without this
   * having to be told about it. Services that were never asked for were never
   * made and have nothing to let go of, so reading them here would only bring
   * them into being.
   */
  async close(): Promise<void> {
    await Promise.all(
      this.memo
        .values()
        .filter((service) => isSimAwsClosing(service))
        .map(async (service) => {
          await service.close();
        }),
    );
  }

  /**
   * Where every service in this scope is made.
   *
   * Read through here rather than reached for in full by each accessor above.
   * The accessors are one memoised call each and there is one per simulated
   * service, so what the whole block costs is worth keeping down: this file
   * has twice been at its line limit with a service waiting to be added to it.
   */
  private get factory(): SimAws["serviceFactory"] {
    return this.simAws.serviceFactory;
  }
}

export interface SimAwsAccountRegionScope {
  accountId: SimAwsAccountId;
  regionName: AwsRegionName;
}
