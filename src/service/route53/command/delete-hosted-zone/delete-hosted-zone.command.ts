import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimRoute53ChangeInfo } from "../create-hosted-zone/create-hosted-zone.command.js";

/**
 * Minimal structural sim Route53 DeleteHostedZone command.
 */
export interface SimDeleteHostedZoneCommand {
  readonly input: SimDeleteHostedZoneCommandInput;
}

/**
 * Minimal structural sim Route53 DeleteHostedZone input.
 */
export interface SimDeleteHostedZoneCommandInput {
  readonly Id?: string | undefined;
}

/**
 * Minimal structural sim Route53 DeleteHostedZone output.
 *
 * Real Route53 answers with the change it made, the same shape
 * ChangeResourceRecordSets returns, because deleting a zone is a change that
 * propagates.
 */
export interface SimDeleteHostedZoneCommandOutput {
  readonly ChangeInfo: SimRoute53ChangeInfo;
  readonly $metadata: SimResponseMetadata;
}
