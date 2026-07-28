import type { AwsRegionName } from "./sim-aws-region.js";
import type { Brand } from "../../util/brand.type.js";
import type { SimAwsAccountRegionContainer } from "./sim-aws-account-region-scope.js";
import { faker } from "@faker-js/faker";
import type { SimS3 } from "../s3/sim-s3.js";
import type { SimCloudFront } from "../cloudfront/sim-cloudfront.js";
import type { SimDynamoDb as SimDynamoDatabase } from "../dynamodb/index.js";
import { SimAws } from "./sim-aws.js";
import type { SimCloudFormation } from "../cloudformation/index.js";
import type { SimAcm } from "../acm/sim-acm.js";
import type { SimRoute53 } from "../route53/index.js";
import type { SimIam } from "../iam/index.js";
import type { SimKms } from "../kms/index.js";
import type { SimLambda } from "../lambda/index.js";
import type { SimAwsPrincipal } from "./caller/sim-aws-caller.js";
import { makeSimAwsAccountRootPrincipal } from "./caller/sim-aws-account-root-principal.js";
import type { SimSts } from "../sts/sim-sts.js";

export type SimAwsAccountId = Brand<string, "SimAwsAccountId">;

export const DEFAULT_SIM_AWS_ACCOUNT_ID = "888888888888" as SimAwsAccountId;

interface SimAwsAccountProperties {
  readonly simAws?: Pick<SimAws, "accountRegionScope">;
  readonly accountId?: SimAwsAccountId;
}

/**
 * Container for simulated AWS services in one AWS Account.
 * The real scope is Account/Region in SimAwsAccountRegionContainer.
 * So SimAwsAccount is like an intermediate navigation handler on the way to a
 * full Account/Region scope.
 */
export class SimAwsAccount {
  public readonly accountId: SimAwsAccountId;

  private readonly simAws: Pick<SimAws, "accountRegionScope">;

  constructor(properties: SimAwsAccountProperties = {}) {
    const { simAws = new SimAws(), accountId = DEFAULT_SIM_AWS_ACCOUNT_ID } =
      properties;

    this.simAws = simAws;
    this.accountId = accountId;
  }

  /**
   * Intrinsic root principal for this simulated AWS Account.
   */
  get rootPrincipal(): SimAwsPrincipal {
    return makeSimAwsAccountRootPrincipal(this.accountId);
  }

  /**
   * Get a simulated AWS Region scoped for this Account.
   */
  region(regionName?: AwsRegionName): SimAwsAccountRegionContainer {
    return this.simAws.accountRegionScope(this.accountId, regionName);
  }

  /**
   * Get simulated ACM for this Account's default Region.
   */
  acm(): SimAcm {
    return this.region().acm();
  }

  /**
   * Get simulated CloudFormation for this Account's default Region.
   */
  cloudFormation(): SimCloudFormation {
    return this.region().cloudFormation();
  }

  /**
   * Get simulated CloudFront for this Account.
   */
  cloudFront(): SimCloudFront {
    return this.region().cloudFront();
  }

  /**
   * Get simulated DynamoDB for this Account's default Region.
   */
  dynamoDb(): SimDynamoDatabase {
    return this.region().dynamoDb();
  }

  /**
   * Get simulated IAM for this Account.
   */
  iam(): SimIam {
    return this.region().iam();
  }

  /**
   * Get simulated KMS for this Account's default Region.
   */
  kms(): SimKms {
    return this.region().kms();
  }

  /**
   * Get simulated Lambda for this Account's default Region.
   */
  lambda(): SimLambda {
    return this.region().lambda();
  }

  /**
   * Get simulated Route53 for this Account's default Region.
   */
  route53(): SimRoute53 {
    return this.region().route53();
  }

  /**
   * Get simulated S3 for this Account's default Region.
   */
  s3(): SimS3 {
    return this.region().s3();
  }

  /**
   * Get simulated STS for this Account's default Region.
   */
  sts(): SimSts {
    return this.region().sts();
  }
}

/**
 * Generate a fake AWS Account ID.
 */
export function makeSimAwsAccountId(): SimAwsAccountId {
  return faker.string.numeric({ length: 12 }) as SimAwsAccountId;
}
