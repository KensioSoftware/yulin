#!/usr/bin/env -S pnpm tsx

/**
 * Writes the snapshot of AWS-managed IAM policies that simulated IAM resolves
 * an attached `arn:aws:iam::aws:policy/...` ARN to.
 *
 * Each policy comes from its page in the AWS Managed Policy Reference Guide,
 * which publishes the default version's document alongside the policy's ARN,
 * description and dates. Reading the guide needs no AWS credentials. The guide
 * does not publish policy IDs, so each ID is derived from the policy's ARN and
 * stays the same from one run to the next.
 *
 * The list below is the catalogue's cut-off: the policies CDK and SAM apps
 * commonly attach for services Yulin simulates. See the AWS-managed policies
 * section of docs/services/iam/README.md.
 *
 * The snapshot is committed, because a test cannot fetch it. Run this to move
 * it on, with `pnpm run iam:aws-managed-policies`.
 */

import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  assertDefined,
  assertNotNull,
} from "../../src/util/type-guard/defined.js";

const projectRoot = path.resolve(import.meta.dirname, "../..");

const outputPath = path.join(
  projectRoot,
  "src/service/iam/policy/aws-managed/sim-iam-aws-managed-policies.json",
);

const referenceUrl =
  "https://docs.aws.amazon.com/aws-managed-policy/latest/reference";

const policyNames = [
  "AdministratorAccess",
  "PowerUserAccess",
  "ReadOnlyAccess",
  "AWSLambdaBasicExecutionRole",
  "AWSLambdaVPCAccessExecutionRole",
  "AWSLambdaSQSQueueExecutionRole",
  "AWSLambdaKinesisExecutionRole",
  "AWSLambdaDynamoDBExecutionRole",
  "AWSLambdaRole",
  "AWSLambdaExecute",
  "AWSLambda_FullAccess",
  "AWSLambda_ReadOnlyAccess",
  "AmazonS3ReadOnlyAccess",
  "AmazonS3FullAccess",
  "AmazonDynamoDBReadOnlyAccess",
  "AmazonDynamoDBFullAccess",
  "AmazonDynamoDBFullAccess_v2",
  "AmazonSQSReadOnlyAccess",
  "AmazonSQSFullAccess",
  "AmazonSNSReadOnlyAccess",
  "AmazonSNSFullAccess",
  "AmazonKinesisReadOnlyAccess",
  "AmazonKinesisFullAccess",
  "AmazonECSTaskExecutionRolePolicy",
  "AmazonEC2ContainerRegistryReadOnly",
  "CloudWatchLogsFullAccess",
  "CloudWatchLogsReadOnlyAccess",
  "CloudWatchReadOnlyAccess",
  "CloudWatchFullAccessV2",
  "AWSStepFunctionsFullAccess",
  "AWSStepFunctionsReadOnlyAccess",
  "AWSXRayDaemonWriteAccess",
  "AWSXrayWriteOnlyAccess",
  "AmazonEventBridgeFullAccess",
  "AmazonEventBridgeReadOnlyAccess",
  "SecretsManagerReadWrite",
  "AmazonSSMReadOnlyAccess",
  "AmazonSESFullAccess",
  "AmazonSESReadOnlyAccess",
  "AmazonAPIGatewayInvokeFullAccess",
  "AmazonCognitoReadOnly",
  "AmazonCognitoPowerUser",
];

const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

interface AwsManagedPolicyRecord {
  readonly policyId: string;
  readonly description?: string;
  readonly createDate: string;
  readonly updateDate: string;
  readonly versionId: string;
  readonly document: unknown;
}

/**
 * The text after a bold label on a page, such as `**ARN**: ...`.
 */
function field(page: string, label: string, name: string): string {
  const prefix = `**${label}`;
  const line = page.split("\n").find((each) => each.includes(prefix));
  const value = line
    ?.slice(line.indexOf(prefix) + prefix.length)
    .replace(/^:?\*\*:?/, "")
    .trim();

  assertDefined(value, `the ${label} on the ${name} page`);

  return value;
}

/**
 * A guide date such as `February 06, 2015, 18:40 UTC` as an ISO timestamp.
 */
function isoDate(text: string, name: string): string {
  const match = /^(\w+) (\d{2}), (\d{4}), (\d{2}):(\d{2}) UTC$/.exec(text);

  assertNotNull(match, `a readable date on the ${name} page, not "${text}"`);

  const [, month = "", day, year, hour, minute] = match;
  const monthNumber = String(months.indexOf(month) + 1).padStart(2, "0");

  return `${year}-${monthNumber}-${day}T${hour}:${minute}:00.000Z`;
}

/**
 * A 21-character policy ID in the `ANPA` form IAM gives managed policies.
 */
function policyId(arn: string): string {
  const digest = createHash("sha256").update(arn).digest("hex");

  return `ANPA${BigInt(`0x${digest}`).toString(36).toUpperCase().slice(0, 17)}`;
}

async function readPolicy(
  name: string,
): Promise<[string, AwsManagedPolicyRecord]> {
  const response = await fetch(`${referenceUrl}/${name}.md`);

  if (!response.ok) {
    throw new Error(`Fetching ${name} failed with ${String(response.status)}`);
  }

  const page = await response.text();
  const arn = field(page, "ARN", name).replaceAll("`", "");
  const pathAndName = arn.replace(/^arn:aws:iam::aws:policy\//, "");
  const json = /## JSON policy document[\s\S]*?```\n([\s\S]*?)\n```/.exec(page);

  if (pathAndName === arn || json?.[1] === undefined) {
    throw new Error(`No policy document or ARN on the ${name} page`);
  }

  const description = /\*\*Description\*\*:\s*(.+)/.exec(page)?.[1]?.trim();

  return [
    pathAndName,
    {
      policyId: policyId(arn),
      ...(description !== undefined && { description }),
      createDate: isoDate(field(page, "Creation time", name), name),
      updateDate: isoDate(field(page, "Edited time", name), name),
      versionId: field(page, "Policy version", name).split(" ", 1)[0] ?? "",
      document: JSON.parse(json[1]) as unknown,
    },
  ];
}

async function main(): Promise<void> {
  const entries = await Promise.all(policyNames.map(readPolicy));

  const snapshot = {
    readOn: new Date().toISOString().slice(0, 10),
    source: referenceUrl,
    policies: Object.fromEntries(
      entries.toSorted(([left], [right]) => left.localeCompare(right)),
    ),
  };

  await writeFile(
    outputPath,
    `${JSON.stringify(snapshot, undefined, 2)}\n`,
    "utf8",
  );

  console.error(
    `Wrote ${String(entries.length)} AWS-managed policies to ${path.relative(projectRoot, outputPath)}.`,
  );
}

await main();
