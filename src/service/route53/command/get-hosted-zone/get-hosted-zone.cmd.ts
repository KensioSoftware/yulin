import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type {
  SimRoute53DelegationSet,
  SimRoute53HostedZoneOutput,
} from "../create-hosted-zone/create-hosted-zone.cmd.js";

/**
 * Minimal structural sim Route53 GetHostedZone command.
 */
export interface SimGetHostedZoneCommand {
  readonly input: SimGetHostedZoneCommandInput;
}

/**
 * Minimal structural sim Route53 GetHostedZone input.
 */
export interface SimGetHostedZoneCommandInput {
  readonly Id?: string | undefined;
}

/**
 * Minimal structural sim Route53 GetHostedZone output.
 */
export interface SimGetHostedZoneCommandOutput {
  readonly HostedZone?: SimRoute53HostedZoneOutput | undefined;
  readonly DelegationSet?: SimRoute53DelegationSet | undefined;
  readonly VPCs?: readonly SimRoute53VPC[] | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Route53 VPC.
 */
export interface SimRoute53VPC {
  readonly VPCRegion?: string | undefined;
  readonly VPCId?: string | undefined;
}
