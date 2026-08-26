import { faker } from "@faker-js/faker";

import type { SimAws } from "../aws/sim-aws.js";
import { SimAws as SimAwsClass } from "../aws/sim-aws.js";

/** A table projecting one prefix per day across three days. */
export const projectedDays = {
  "projection.enabled": "true",
  "projection.day.type": "date",
  "projection.day.format": "yyyy-MM-dd",
  "projection.day.range": "2026-08-24,2026-08-26",
  "storage.location.template": `s3://rainlytics-logs/logs/\${day}/`,
};

/**
 * A simulation holding a results Bucket, a logs Bucket, a workgroup and one
 * catalog table over the logs.
 */
export async function aScannedSimulation(
  parameters: Record<string, string> = {},
  cutoff?: number,
): Promise<{ simAws: SimAws; workGroup: string }> {
  const simAws = new SimAwsClass();
  const workGroup = `analytics-${faker.string.uuid()}`;

  await simAws.s3().createBucket({ input: { Bucket: "rainlytics-results" } });
  await simAws.s3().createBucket({ input: { Bucket: "rainlytics-logs" } });
  await simAws.athena().createWorkGroup({
    input: {
      Name: workGroup,
      Configuration: {
        ResultConfiguration: { OutputLocation: "s3://rainlytics-results/q/" },
        ...(cutoff !== undefined && { BytesScannedCutoffPerQuery: cutoff }),
      },
    },
  });

  simAws.glue().createDatabase({
    input: { DatabaseInput: { Name: "rainlytics" } },
  });
  simAws.glue().createTable({
    input: {
      DatabaseName: "rainlytics",
      TableInput: {
        Name: "access_logs",
        PartitionKeys:
          Object.keys(parameters).length === 0
            ? []
            : [{ Name: "day", Type: "string" }],
        StorageDescriptor: { Location: "s3://rainlytics-logs/logs/" },
        Parameters: parameters,
      },
    },
  });

  return { simAws, workGroup };
}

/** Put one object of a given size under the logs Bucket. */
export async function aSeededObject(
  simAws: SimAws,
  key: string,
  bytes: number,
): Promise<void> {
  await simAws.s3().putObject({
    input: { Bucket: "rainlytics-logs", Key: key, Body: "x".repeat(bytes) },
  });
}
