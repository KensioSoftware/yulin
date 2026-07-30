import type { SimAwsAccount, SimAwsAccountId } from "./sim-aws-account.js";
import type { AwsRegionName, SimAwsRegion } from "./sim-aws-region.js";
import { Memo } from "../../util/memo/memo.js";
import { SimAws } from "./sim-aws.js";
import type { SimS3 } from "../s3/sim-s3.js";
import type { SimCloudFront } from "../cloudfront/sim-cloudfront.js";
import type { SimDynamoDb as SimDynamoDatabase } from "../dynamodb/index.js";
import type { SimCloudFormation } from "../cloudformation/index.js";
import type { SimCognitoIdentityProvider } from "../cognito/index.js";
import type { SimRoute53 } from "../route53/index.js";
import type { SimAcm } from "../acm/sim-acm.js";
import type { SimIam } from "../iam/index.js";
import type { SimKms } from "../kms/index.js";
import type { SimLambda } from "../lambda/index.js";
import type { SimSecretsManager } from "../secretsmanager/index.js";
import type { SimSqs } from "../sqs/index.js";
import type { SimSsm } from "../ssm/index.js";
import type { SimSts } from "../sts/sim-sts.js";

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

  /**
   * Get simulated ACM for this account and region.
   */
  acm(): SimAcm {
    return this.memo.getOrCreate("acm", () =>
      this.simAws.serviceFactory.createAcm(this),
    );
  }

  /**
   * Get simulated CloudFormation for this account and region.
   */
  cloudFormation(): SimCloudFormation {
    return this.memo.getOrCreate("cloudFormation", () =>
      this.simAws.serviceFactory.createCloudFormation(this),
    );
  }

  /**
   * Get simulated CloudFront for this account.
   */
  cloudFront(): SimCloudFront {
    return this.memo.getOrCreate("cloudFront", () =>
      this.simAws.serviceFactory.createCloudFront(this),
    );
  }

  /**
   * Get simulated Cognito user pools for this account and region.
   */
  cognitoIdentityProvider(): SimCognitoIdentityProvider {
    return this.memo.getOrCreate("cognitoIdentityProvider", () =>
      this.simAws.serviceFactory.createCognitoIdentityProvider(this),
    );
  }

  /**
   * Get simulated DynamoDB for this account and region.
   */
  dynamoDb(): SimDynamoDatabase {
    return this.memo.getOrCreate("dynamoDb", () =>
      this.simAws.serviceFactory.createDynamoDb(this),
    );
  }

  /**
   * Get simulated IAM for this account.
   */
  iam(): SimIam {
    return this.memo.getOrCreate("iam", () =>
      this.simAws.serviceFactory.createIam(this),
    );
  }

  /**
   * Get simulated KMS for this account and region.
   */
  kms(): SimKms {
    return this.memo.getOrCreate("kms", () =>
      this.simAws.serviceFactory.createKms(this),
    );
  }

  /**
   * Get simulated Lambda for this account and region.
   */
  lambda(): SimLambda {
    return this.memo.getOrCreate("lambda", () =>
      this.simAws.serviceFactory.createLambda(this),
    );
  }

  /**
   * Get simulated Route53 for this account.
   */
  route53(): SimRoute53 {
    return this.memo.getOrCreate("route53", () =>
      this.simAws.serviceFactory.createRoute53(this),
    );
  }

  /**
   * Get simulated S3 for this account and region.
   */
  s3(): SimS3 {
    return this.memo.getOrCreate("s3", () =>
      this.simAws.serviceFactory.createS3(this),
    );
  }

  /**
   * Get simulated Secrets Manager for this account and region.
   */
  secretsManager(): SimSecretsManager {
    return this.memo.getOrCreate("secretsManager", () =>
      this.simAws.serviceFactory.createSecretsManager(this),
    );
  }

  /**
   * Get simulated SQS for this account and region.
   */
  sqs(): SimSqs {
    return this.memo.getOrCreate("sqs", () =>
      this.simAws.serviceFactory.createSqs(this),
    );
  }

  /**
   * Get simulated SSM for this account and region.
   */
  ssm(): SimSsm {
    return this.memo.getOrCreate("ssm", () =>
      this.simAws.serviceFactory.createSsm(this),
    );
  }

  /**
   * Get simulated STS for this account and region.
   */
  sts(): SimSts {
    return this.memo.getOrCreate("sts", () =>
      this.simAws.serviceFactory.createSts(this),
    );
  }
}

export interface SimAwsAccountRegionScope {
  accountId: SimAwsAccountId;
  regionName: AwsRegionName;
}
