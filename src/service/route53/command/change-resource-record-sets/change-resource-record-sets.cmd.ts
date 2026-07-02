import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimRoute53ChangeInfo } from "../create-hosted-zone/create-hosted-zone.cmd.js";

/**
 * Minimal structural sim Route53 ChangeResourceRecordSets command.
 */
export interface SimChangeResourceRecordSetsCommand {
  readonly input: SimChangeResourceRecordSetsCommandInput;
}

/**
 * Minimal structural sim Route53 ChangeResourceRecordSets input.
 */
export interface SimChangeResourceRecordSetsCommandInput {
  readonly HostedZoneId?: string | undefined;
  readonly ChangeBatch?: SimRoute53ChangeBatch | undefined;
}

/**
 * Minimal structural sim Route53 ChangeResourceRecordSets output.
 */
export interface SimChangeResourceRecordSetsCommandOutput {
  readonly ChangeInfo?: SimRoute53ChangeInfo | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Route53 ChangeBatch.
 */
export interface SimRoute53ChangeBatch {
  readonly Comment?: string | undefined;
  readonly Changes?: readonly SimRoute53Change[] | undefined;
}

/**
 * Minimal structural sim Route53 Change.
 */
export interface SimRoute53Change {
  readonly Action?: SimRoute53ChangeAction | undefined;
  readonly ResourceRecordSet?: SimRoute53ResourceRecordSet | undefined;
}

/**
 * Minimal structural sim Route53 Change action.
 */
export type SimRoute53ChangeAction = "CREATE" | "UPSERT" | "DELETE";

/**
 * Minimal structural sim Route53 ResourceRecordSet.
 */
export interface SimRoute53ResourceRecordSet {
  readonly Name?: string | undefined;
  readonly Type?: string | undefined;
  readonly TTL?: number | undefined;
  readonly ResourceRecords?: readonly SimRoute53ResourceRecord[] | undefined;
  readonly AliasTarget?: SimRoute53AliasTarget | undefined;
}

/**
 * Minimal structural sim Route53 ResourceRecord.
 */
export interface SimRoute53ResourceRecord {
  readonly Value?: string | undefined;
}

/**
 * Minimal structural sim Route53 AliasTarget.
 */
export interface SimRoute53AliasTarget {
  readonly HostedZoneId?: string | undefined;
  readonly DNSName?: string | undefined;
  readonly EvaluateTargetHealth?: boolean | undefined;
}
