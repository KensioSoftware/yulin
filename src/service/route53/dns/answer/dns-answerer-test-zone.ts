import type { SimAws } from "../../../aws/sim-aws.js";
import type { SimRoute53RecordType } from "../../record/sim-route53-record.js";
import type { SimRoute53 } from "../../sim-route53.js";

export interface TestRecord {
  readonly name: string;
  readonly type: SimRoute53RecordType;
  readonly values: readonly string[];
  /** Omitted entirely when null, which the SDK allows. */
  readonly ttl?: number | null;
  /** Store as an alias record, which carries a target instead of a TTL. */
  readonly alias?: boolean;
}

/**
 * Create a hosted zone holding the given records, through the normal command
 * path so the records are normalised the way stored records always are.
 *
 * Commands are built as plain structural inputs rather than from the AWS SDK,
 * because this is a shared helper rather than a test file, and runtime source
 * does not import SDK packages.
 * @internal
 */
export async function createTestZone(
  simAws: SimAws,
  zoneName: string,
  records: readonly TestRecord[],
  route53: SimRoute53 = simAws.route53(),
): Promise<void> {
  const createOutput = await route53.createHostedZone({
    input: {
      Name: zoneName,
      CallerReference: `${zoneName}-dns-test`,
    },
  });

  if (records.length > 0) {
    await route53.changeResourceRecordSets({
      input: {
        HostedZoneId: createOutput.HostedZone?.Id,
        ChangeBatch: {
          Changes: records.map((record) => ({
            Action: "CREATE" as const,
            ResourceRecordSet: recordSet(record),
          })),
        },
      },
    });
  }

  await simAws.backgroundTasksComplete();
}

function recordSet(record: TestRecord): object {
  if (record.alias === true) {
    return {
      Name: record.name,
      Type: record.type,
      AliasTarget: {
        HostedZoneId: "Z2FDTNDATAQYW2",
        DNSName: record.values.at(0),
        EvaluateTargetHealth: false,
      },
    };
  }

  return {
    Name: record.name,
    Type: record.type,
    TTL: storedTtl(record),
    ResourceRecords: record.values.map((value) => ({ Value: value })),
  };
}

function storedTtl(record: TestRecord): number | undefined {
  if (record.ttl === null) {
    return undefined;
  }

  return record.ttl ?? 300;
}
