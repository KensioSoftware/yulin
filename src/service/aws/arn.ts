import type { AwsRegionName } from "./sim-aws-region.js";
import type { SimAwsAccountId } from "./sim-aws-account.js";
import { DynamicFactory } from "@kensio/part-factory";
import { faker } from "@faker-js/faker";

export type SimArn =
  `arn:aws:${string}:${AwsRegionName}:${SimAwsAccountId}:${string}/${string}`;

type SimArnServiceName = "dynamodb" | "s3";

export interface SimArnComponents {
  partition: "aws";
  service: SimArnServiceName;
  region: AwsRegionName;
  accountId: SimAwsAccountId;
  resourceType: string;
  resourceId: string;
}

const simArnComponentsFactory = new DynamicFactory<SimArnComponents>(() => ({
  partition: "aws",
  service: faker.helpers.arrayElement(["dynamodb", "s3"]),
  region: faker.helpers.arrayElement([
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
  ]),
  accountId: faker.string.numeric({ length: 12 }) as SimAwsAccountId,
  resourceType: "resource",
  resourceId: faker.string.alphanumeric({ length: 10 }),
}));

/**
 * Generate a fake ARN.
 */
export function makeSimArn(overrides?: Partial<SimArnComponents>): SimArn {
  const components = simArnComponentsFactory.make(overrides);
  return `arn:${components.partition}:${components.service}:${components.region}:${components.accountId}:${components.resourceType}/${components.resourceId}`;
}
