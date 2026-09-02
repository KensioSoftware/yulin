/**
 * The Bucket every Object tagging test starts from, and the reader its
 * assertions use.
 *
 * This lives under `test/` for the same reasons as
 * `test/s3/notification-topic-fixture.ts`: eslint rejects a test file that
 * exports helpers alongside its own `describe` calls, and `test/**` is
 * type-checked with everything else, excluded from the published build, not
 * collected as a suite, and not counted in coverage.
 */

import {
  CreateBucketCommand,
  PutObjectCommand,
  type Tag,
} from "@aws-sdk/client-s3";
import { faker } from "@faker-js/faker";

import { SimAws } from "../../src/service/aws/sim-aws.js";
import type { SimS3 } from "../../src/service/s3/sim-s3.js";

/**
 * One simulated S3 holding one report, ready to be tagged.
 */
export interface SimS3ReportBucket {
  readonly simS3: SimS3;
  readonly bucketName: string;
  readonly key: string;
}

/**
 * A Bucket of its own holding one report, written with the tags given.
 *
 * The Bucket is named after a UUID so no test can be talking about another's,
 * and each gets a simulation to itself. What a tagging test is about is the
 * tags, so everything else about the Object is the same in every one.
 */
export async function reportBucket(
  tagging?: string,
): Promise<SimS3ReportBucket> {
  const bucketName = `reports-${faker.string.uuid()}`;
  const key = "quarterly.csv";
  const simS3 = new SimAws().s3();

  await simS3.createBucket(new CreateBucketCommand({ Bucket: bucketName }));
  await simS3.putObject(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: "period,total",
      ...(tagging !== undefined && { Tagging: tagging }),
    }),
  );

  return { simS3, bucketName, key };
}

/**
 * The tags on an Object, as a map, so an assertion can name one without
 * depending on where in the set it landed.
 */
export function tagsByKey(tagSet: readonly Tag[]): Record<string, string> {
  return Object.fromEntries(
    tagSet.map((tag) => [tag.Key ?? "", tag.Value ?? ""]),
  );
}
