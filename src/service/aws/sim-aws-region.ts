import type { SimAwsAccountId } from "./sim-aws-account.js";
import type { SimAwsAccountRegionContainer } from "./sim-aws-account-region-scope.js";
import { faker } from "@faker-js/faker";
import type { SimS3 } from "../s3/sim-s3.js";
import type { SimCloudFront } from "../cloudfront/sim-cloudfront.js";
import type { SimDynamoDb } from "../dynamodb/index.js";
import { SimAws } from "./sim-aws.js";
import type { SimCloudFormation } from "../cloudformation/index.js";
import type { SimAcm } from "../acm/sim-acm.js";
import type { SimRoute53 } from "../route53/index.js";

export const AWS_REGION_NAMES = [
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "af-south-1",
  "ap-east-1",
  "ap-south-2",
  "ap-southeast-3",
  "ap-southeast-5",
  "ap-southeast-4",
  "ap-south-1",
  "ap-southeast-6",
  "ap-northeast-3",
  "ap-northeast-2",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-east-2",
  "ap-southeast-7",
  "ap-northeast-1",
  "ca-central-1",
  "ca-west-1",
  "eu-central-1",
  "eu-west-1",
  "eu-west-2",
  "eu-south-1",
  "eu-west-3",
  "eu-south-2",
  "eu-north-1",
  "eu-central-2",
  "il-central-1",
  "mx-central-1",
  "me-south-1",
  "me-central-1",
  "sa-east-1",
] as const;

export const AwsRegion = {
  UsEast1: "us-east-1",
  UsEast2: "us-east-2",
  UsWest1: "us-west-1",
  UsWest2: "us-west-2",
  AfSouth1: "af-south-1",
  ApEast1: "ap-east-1",
  ApSouth2: "ap-south-2",
  ApSoutheast3: "ap-southeast-3",
  ApSoutheast5: "ap-southeast-5",
  ApSoutheast4: "ap-southeast-4",
  ApSouth1: "ap-south-1",
  ApSoutheast6: "ap-southeast-6",
  ApNortheast3: "ap-northeast-3",
  ApNortheast2: "ap-northeast-2",
  ApSoutheast1: "ap-southeast-1",
  ApSoutheast2: "ap-southeast-2",
  ApEast2: "ap-east-2",
  ApSoutheast7: "ap-southeast-7",
  ApNortheast1: "ap-northeast-1",
  CaCentral1: "ca-central-1",
  CaWest1: "ca-west-1",
  EuCentral1: "eu-central-1",
  EuWest1: "eu-west-1",
  EuWest2: "eu-west-2",
  EuSouth1: "eu-south-1",
  EuWest3: "eu-west-3",
  EuSouth2: "eu-south-2",
  EuNorth1: "eu-north-1",
  EuCentral2: "eu-central-2",
  IlCentral1: "il-central-1",
  MxCentral1: "mx-central-1",
  MeSouth1: "me-south-1",
  MeCentral1: "me-central-1",
  SaEast1: "sa-east-1",
} as const satisfies Record<string, AwsRegionName>;

export type AwsRegionName = (typeof AWS_REGION_NAMES)[number];

export const DEFAULT_SIM_AWS_REGION_NAME = "us-east-1" as const;

interface SimAwsRegionProps {
  readonly simAws?: Pick<SimAws, "accountRegionScope">;
  readonly regionName?: AwsRegionName;
}

/**
 * Container for simulated AWS services in one AWS Region.
 * The real scope is Account/Region in SimAwsAccountRegionContainer.
 * So SimAwsRegion is like an intermediate navigation handler on the way to a
 * full Account/Region scope.
 */
export class SimAwsRegion {
  private readonly simAws: Pick<SimAws, "accountRegionScope">;
  public readonly regionName: AwsRegionName;

  constructor(props: SimAwsRegionProps = {}) {
    const { simAws = new SimAws(), regionName = DEFAULT_SIM_AWS_REGION_NAME } =
      props;

    this.simAws = simAws;
    this.regionName = regionName;
  }

  /**
   * Get a simulated AWS Account scoped for this Region.
   */
  account(accountId?: SimAwsAccountId | string): SimAwsAccountRegionContainer {
    return this.simAws.accountRegionScope(
      accountId as SimAwsAccountId,
      this.regionName,
    );
  }

  /**
   * Get simulated ACM for this Region's default Account.
   */
  acm(): SimAcm {
    return this.account().acm();
  }

  /**
   * Get simulated CloudFormation for this Region's default Account.
   */
  cloudFormation(): SimCloudFormation {
    return this.account().cloudFormation();
  }

  /**
   * Get simulated CloudFront for this Region's default Account.
   */
  cloudFront(): SimCloudFront {
    return this.account().cloudFront();
  }

  /**
   * Get simulated DynamoDB for this Region's default Account.
   */
  dynamoDb(): SimDynamoDb {
    return this.account().dynamoDb();
  }

  /**
   * Get simulated Route53 for this Region's default Account.
   */
  route53(): SimRoute53 {
    return this.account().route53();
  }

  /**
   * Get simulated S3 for this Region's default Account.
   */
  s3(): SimS3 {
    return this.account().s3();
  }
}

/**
 * Choose a random AWS Region name.
 */
export function makeAwsRegionName(): AwsRegionName {
  return faker.helpers.arrayElement(AWS_REGION_NAMES);
}
