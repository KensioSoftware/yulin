import { type AwsRegionName, makeAwsRegionName } from "./sim-aws-region.js";
import {
  makeSimAwsAccountId,
  type SimAwsAccountId,
} from "./sim-aws-account.js";
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
  region: makeAwsRegionName(),
  accountId: makeSimAwsAccountId(),
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
