import {
  simAthenaTablePartitions,
  type SimAthenaPartitionedTable,
} from "./sim-athena-table-partitions.js";

const noon = new Date("2026-08-26T12:00:00.000Z");

/** A table `rainlytics.t` projecting three days of August. */
function aThreeDayTable(): SimAthenaPartitionedTable {
  return {
    name: "t",
    databaseName: "rainlytics",
    parameters: {
      "projection.enabled": "true",
      "projection.day.type": "date",
      "projection.day.format": "yyyy-MM-dd",
      "projection.day.range": "2026-08-24,2026-08-26",
      "storage.location.template": `s3://rainlytics-logs/logs/\${day}/`,
    },
    partitionKeys: [{ Name: "day" }],
    storageDescriptor: { Location: "s3://rainlytics-logs/cloudfront/" },
  };
}

/** The prefixes one query reads from the three-day table. */
export function prefixesFor(queryString: string): readonly string[] {
  return simAthenaTablePartitions({
    table: aThreeDayTable(),
    registered: [],
    queryString,
    now: noon,
  }).map((partition) => partition.prefix);
}
