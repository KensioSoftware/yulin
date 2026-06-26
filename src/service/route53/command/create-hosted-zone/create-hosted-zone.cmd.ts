import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim Route53 CreateHostedZone command.
 */
export interface SimCreateHostedZoneCommand {
  readonly input: SimCreateHostedZoneCommandInput;
}

/**
 * Minimal structural sim Route53 CreateHostedZone input.
 */
export interface SimCreateHostedZoneCommandInput {
  readonly Name?: string | undefined;
  readonly CallerReference?: string | undefined;
  readonly HostedZoneConfig?: SimRoute53HostedZoneConfig | undefined;
}

/**
 * Minimal structural sim Route53 CreateHostedZone output.
 */
export interface SimCreateHostedZoneCommandOutput {
  readonly HostedZone?: SimRoute53HostedZoneOutput | undefined;
  readonly ChangeInfo?: SimRoute53ChangeInfo | undefined;
  readonly DelegationSet?: SimRoute53DelegationSet | undefined;
  readonly Location?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Route53 HostedZone.
 */
export interface SimRoute53HostedZoneOutput {
  readonly Id?: string | undefined;
  readonly Name?: string | undefined;
  readonly CallerReference?: string | undefined;
  readonly Config?: SimRoute53HostedZoneConfig | undefined;
  readonly ResourceRecordSetCount?: number | undefined;
}

/**
 * Minimal structural sim Route53 HostedZoneConfig.
 */
export interface SimRoute53HostedZoneConfig {
  readonly Comment?: string | undefined;
  readonly PrivateZone?: boolean | undefined;
}

/**
 * Minimal structural sim Route53 ChangeInfo.
 */
export interface SimRoute53ChangeInfo {
  readonly Id?: string | undefined;
  readonly Status?: "PENDING" | "INSYNC" | undefined;
  readonly SubmittedAt?: Date | undefined;
}

/**
 * Minimal structural sim Route53 DelegationSet.
 */
export interface SimRoute53DelegationSet {
  readonly NameServers?: readonly string[] | undefined;
}
