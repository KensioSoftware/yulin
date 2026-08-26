import { faker } from "@faker-js/faker";

import type { SimClock } from "../../util/clock/sim-clock.js";
import type { SimGlueColumn } from "../glue/table/sim-glue-table-schema.js";
import { SimAws } from "../aws/sim-aws.js";

/** The SerDe class name a JSON lines table declares. */
export const jsonSerDe = "org.openx.data.jsonserde.JsonSerDe";

/** The SerDe class name a quoted CSV table declares. */
export const csvSerDe = "org.apache.hadoop.hive.serde2.OpenCSVSerde";

/** Where every table in these fixtures keeps its data. */
export const logsBucket = "rainlytics-logs";

/** A simulation holding both Buckets, a workgroup and a catalog database. */
export interface SimAthenaEngineSimulation {
  readonly simAws: SimAws;
  readonly workGroup: string;
}

/** What one catalog table is declared with. */
export interface SimAthenaEngineTableInput {
  readonly name: string;
  readonly columns: readonly SimGlueColumn[];
  readonly partitionKeys?: readonly SimGlueColumn[];
  readonly serDe?: string | undefined;
  readonly serDeParameters?: Record<string, string>;
  readonly parameters?: Record<string, string>;
  readonly location?: string;
}

/**
 * A simulation with somewhere to keep data, somewhere to write results, and a
 * `rainlytics` database in the Data Catalog.
 *
 * The engine is left off. A test that wants it turns it on, which is what a
 * reader of that test needs to see.
 */
export async function anEngineSimulation(
  clock?: SimClock,
): Promise<SimAthenaEngineSimulation> {
  const simAws = new SimAws(clock === undefined ? {} : { clock });
  const workGroup = `analytics-${faker.string.uuid()}`;

  await simAws.s3().createBucket({ input: { Bucket: logsBucket } });
  await simAws.s3().createBucket({ input: { Bucket: "rainlytics-results" } });
  await simAws.athena().createWorkGroup({
    input: {
      Name: workGroup,
      Configuration: {
        ResultConfiguration: { OutputLocation: "s3://rainlytics-results/q/" },
      },
    },
  });

  simAws.glue().createDatabase({
    input: { DatabaseInput: { Name: "rainlytics" } },
  });

  return { simAws, workGroup };
}

/** Declare one table in the `rainlytics` database. */
export function aCatalogTable(
  simAws: SimAws,
  table: SimAthenaEngineTableInput,
): void {
  simAws.glue().createTable({
    input: {
      DatabaseName: "rainlytics",
      TableInput: {
        Name: table.name,
        PartitionKeys: table.partitionKeys ?? [],
        Parameters: table.parameters ?? {},
        StorageDescriptor: {
          Columns: table.columns,
          Location: table.location ?? `s3://${logsBucket}/${table.name}/`,
          SerdeInfo: {
            SerializationLibrary: table.serDe ?? jsonSerDe,
            Parameters: table.serDeParameters ?? {},
          },
        },
      },
    },
  });
}

/** Put one object of literal text under the logs Bucket. */
export async function aSeededObject(
  simAws: SimAws,
  key: string,
  body: string,
): Promise<void> {
  await simAws
    .s3()
    .putObject({ input: { Bucket: logsBucket, Key: key, Body: body } });
}

/** Put one object of JSON lines under the logs Bucket. */
export async function aSeededJson(
  simAws: SimAws,
  key: string,
  records: readonly Record<string, unknown>[],
): Promise<void> {
  const lines = records.map((record) => JSON.stringify(record));

  await aSeededObject(simAws, key, `${lines.join("\n")}\n`);
}
