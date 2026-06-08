import type { SimAwsAccountId } from "./sim-aws-account.js";
import type { SimAwsAccountRegionContainer } from "./sim-aws-account-region-scope.js";
import type {
  NoSimAwsServices,
  SimAwsAccountRegionScopes,
  SimAwsServiceMap,
} from "./sim-aws-services.js";
import { faker } from "@faker-js/faker";

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

export type AwsRegionName = (typeof AWS_REGION_NAMES)[number];

export const DEFAULT_SIM_AWS_REGION_NAME = "us-east-1" as const;

/**
 * Container for simulated AWS services in one AWS Region.
 * The real scope is Account/Region in SimAwsAccountRegionContainer.
 * So SimAwsRegion is like an intermediate navigation handler on the way to a
 * full Account/Region scope.
 */
export class SimAwsRegion<
  TServices extends SimAwsServiceMap = NoSimAwsServices,
> {
  constructor(
    private readonly accountRegionScopes: SimAwsAccountRegionScopes<TServices>,
    public readonly regionName: AwsRegionName = DEFAULT_SIM_AWS_REGION_NAME,
  ) {}

  /**
   * Get a simulated AWS Account scoped for this Region.
   */
  account(
    accountId?: SimAwsAccountId | string,
  ): SimAwsAccountRegionContainer<TServices> {
    return this.accountRegionScopes.accountRegionScope(
      accountId as SimAwsAccountId,
      this.regionName,
    );
  }

  /**
   * Get an installed simulated AWS service for this Region's default Account.
   * The service must be installed with the appropriate installer function
   * first.
   */
  service<TKey extends keyof TServices>(serviceName: TKey): TServices[TKey] {
    return this.account().service(serviceName);
  }
}

/**
 * Choose a random AWS Region name.
 */
export function makeAwsRegionName(): AwsRegionName {
  return faker.helpers.arrayElement(AWS_REGION_NAMES);
}
