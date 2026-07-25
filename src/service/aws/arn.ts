import { type AwsRegionName, makeAwsRegionName } from "./sim-aws-region.js";
import {
  makeSimAwsAccountId,
  type SimAwsAccountId,
} from "./sim-aws-account.js";
import { DynamicFactory } from "@kensio/part-factory";
import { faker } from "@faker-js/faker";

export type SimArnServiceName = string;

export type SimArn =
  `arn:aws:${string}:${string}:${string}:${string}/${string}`;

export interface SimArnComponents {
  partition: "aws";
  service: SimArnServiceName;
  region: AwsRegionName;
  accountId: SimAwsAccountId;
  resourceType: string;
  resourceId: string;
}

const defaultSimArnServiceNames = ["cloudfront", "dynamodb", "s3"] as const;

const simArnComponentsFactory = new DynamicFactory<SimArnComponents>(() => ({
  partition: "aws",
  service: faker.helpers.arrayElement(defaultSimArnServiceNames),
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

/**
 * Read the parts of an ARN.
 *
 * Undefined means the value is not an ARN of this shape, rather than that
 * something went wrong: ARNs reach the simulator from user templates and SDK
 * input, where a value that is not an ARN at all is an ordinary case a caller
 * reports in its own terms.
 */
export function parseSimArn(value: string): SimArnComponents | undefined {
  const [arnPrefix, partition, service, region, accountId, resource] =
    value.split(":");

  if (
    arnPrefix !== "arn" ||
    partition !== "aws" ||
    service === undefined ||
    region === undefined ||
    accountId === undefined ||
    resource === undefined
  ) {
    return undefined;
  }

  const separatorIndex = resource.indexOf("/");

  if (separatorIndex === -1) {
    return undefined;
  }

  return {
    partition,
    service,
    region: region as AwsRegionName,
    accountId: accountId as SimAwsAccountId,
    resourceType: resource.slice(0, separatorIndex),
    resourceId: resource.slice(separatorIndex + 1),
  };
}
