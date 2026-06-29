import type { SimAwsServiceTarget } from "../../../serve/controller/sim-service-controller.js";

export type SimRoute53RecordType =
  "A" | "AAAA" | "CNAME" | "TXT" | "NS" | "SOA";

export interface SimRoute53Record {
  readonly name: string;
  readonly type: SimRoute53RecordType;
  readonly values: readonly string[];
  readonly ttl?: number | undefined;
}

export interface SimRoute53HttpResolution {
  readonly target: SimAwsServiceTarget;
  readonly rewrittenHostname?: string;
}
