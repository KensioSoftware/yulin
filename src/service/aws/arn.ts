import { type AwsRegionName, makeAwsRegionName } from "./sim-aws-region.js";
import {
  makeSimAwsAccountId,
  type SimAwsAccountId,
} from "./sim-aws-account.js";
import { DynamicFactory } from "@kensio/part-factory";
import { faker } from "@faker-js/faker";
import {
  SIM_AWS_SERVICE_NAMES,
  type SimAwsServiceName,
} from "./sim-aws-services.js";

export type SimArn =
  `arn:aws:${SimAwsServiceName}:${AwsRegionName}:${SimAwsAccountId}:${string}/${string}`;

export interface SimArnComponents {
  partition: "aws";
  service: SimAwsServiceName;
  region: AwsRegionName;
  accountId: SimAwsAccountId;
  resourceType: string;
  resourceId: string;
}

const simArnComponentsFactory = new DynamicFactory<SimArnComponents>(() => ({
  partition: "aws",
  service: faker.helpers.arrayElement(SIM_AWS_SERVICE_NAMES),
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
