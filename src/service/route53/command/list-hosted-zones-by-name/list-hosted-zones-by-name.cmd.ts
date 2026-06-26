import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimRoute53HostedZoneOutput } from "../create-hosted-zone/create-hosted-zone.cmd.js";

/**
 * Minimal structural sim Route53 ListHostedZonesByName command.
 */
export interface SimListHostedZonesByNameCommand {
  readonly input: SimListHostedZonesByNameCommandInput;
}

/**
 * Minimal structural sim Route53 ListHostedZonesByName input.
 */
export interface SimListHostedZonesByNameCommandInput {
  readonly DNSName?: string | undefined;
  readonly HostedZoneId?: string | undefined;
  readonly MaxItems?: string | undefined;
}

/**
 * Minimal structural sim Route53 ListHostedZonesByName output.
 */
export interface SimListHostedZonesByNameCommandOutput {
  readonly HostedZones?: readonly SimRoute53HostedZoneOutput[] | undefined;
  readonly DNSName?: string | undefined;
  readonly HostedZoneId?: string | undefined;
  readonly IsTruncated?: boolean | undefined;
  readonly NextDNSName?: string | undefined;
  readonly NextHostedZoneId?: string | undefined;
  readonly MaxItems?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}
