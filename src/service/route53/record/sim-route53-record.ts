export type SimRoute53RecordType =
  "A" | "AAAA" | "CNAME" | "TXT" | "NS" | "SOA";

export interface SimRoute53Record {
  readonly name: string;
  readonly type: SimRoute53RecordType;
  readonly values: readonly string[];
  readonly ttl?: number | undefined;
  readonly alias?: boolean | undefined;
}
