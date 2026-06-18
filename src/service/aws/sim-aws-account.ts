import type { AwsRegionName } from "./sim-aws-region.js";
import type { Brand } from "../../util/brand.type.js";
import type { SimAwsAccountRegionContainer } from "./sim-aws-account-region-scope.js";
import { faker } from "@faker-js/faker";
import type { SimS3 } from "../s3/sim-s3.js";
import type { SimCloudFront } from "../cloudfront/sim-cloudfront.js";
import type { SimDynamoDb } from "../dynamodb/index.js";
import { SimAws } from "./sim-aws.js";
import type { SimCloudFormation } from "../cloudformation/index.js";

export type SimAwsAccountId = Brand<string, "SimAwsAccountId">;

export const DEFAULT_SIM_AWS_ACCOUNT_ID = "888888888888" as SimAwsAccountId;

interface SimAwsAccountProps {
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
  private readonly simAws: Pick<SimAws, "accountRegionScope">;
  public readonly accountId: SimAwsAccountId;

  constructor(props: SimAwsAccountProps = {}) {
    const { simAws = new SimAws(), accountId = DEFAULT_SIM_AWS_ACCOUNT_ID } =
      props;

    this.simAws = simAws;
    this.accountId = accountId;
  }

  /**
   * Get a simulated AWS Region scoped for this Account.
   */
  region(regionName?: AwsRegionName): SimAwsAccountRegionContainer {
    return this.simAws.accountRegionScope(this.accountId, regionName);
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
  dynamoDb(): SimDynamoDb {
    return this.region().dynamoDb();
  }

  /**
   * Get simulated S3 for this Account's default Region.
   */
  s3(): SimS3 {
    return this.region().s3();
  }
}

/**
 * Generate a fake AWS Account ID.
 */
export function makeSimAwsAccountId(): SimAwsAccountId {
  return faker.string.numeric({ length: 12 }) as SimAwsAccountId;
}
