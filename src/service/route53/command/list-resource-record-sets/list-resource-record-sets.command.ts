import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimRoute53Record } from "../../record/sim-route53-record.js";
import type { SimRoute53ResourceRecordSet } from "../change-resource-record-sets/change-resource-record-sets.command.js";

type SimRoute53RecordType = SimRoute53Record["type"];

/**
 * Minimal structural sim Route53 ListResourceRecordSets command.
 */
export interface SimListResourceRecordSetsCommand {
  readonly input: SimListResourceRecordSetsCommandInput;
}

/**
 * Minimal structural sim Route53 ListResourceRecordSets input.
 */
export interface SimListResourceRecordSetsCommandInput {
  readonly HostedZoneId?: string | undefined;
  readonly StartRecordName?: string | undefined;
  readonly StartRecordType?: string | undefined;
  readonly MaxItems?: number | undefined;
}

/**
 * Minimal structural sim Route53 ListResourceRecordSets output.
 */
export interface SimListResourceRecordSetsCommandOutput {
  readonly ResourceRecordSets?:
    | readonly SimRoute53ResourceRecordSet[]
    | undefined;
  readonly IsTruncated?: boolean | undefined;
  readonly NextRecordName?: string | undefined;
  // Narrower than a bare string so a returned marker can be fed straight back
  // in as StartRecordType, which the AWS SDK types as an RRType union.
  readonly NextRecordType?: SimRoute53RecordType | undefined;
  readonly MaxItems?: number | undefined;
  readonly $metadata: SimResponseMetadata;
}
