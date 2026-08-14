import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimRoute53KeySigningKeyView } from "../../dnssec/sim-route53-key-signing-key.js";
import type { SimRoute53ServeSignature } from "../../dnssec/sim-route53-zone-dnssec.js";
import type { SimRoute53ChangeInfo } from "../create-hosted-zone/create-hosted-zone.command.js";

/**
 * Minimal structural sim Route53 CreateKeySigningKey command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/route-53/command/CreateKeySigningKeyCommand/
 */
export interface SimCreateKeySigningKeyCommand {
  readonly input: SimCreateKeySigningKeyCommandInput;
}

export interface SimCreateKeySigningKeyCommandInput {
  readonly CallerReference?: string | undefined;
  readonly HostedZoneId?: string | undefined;
  readonly KeyManagementServiceArn?: string | undefined;
  readonly Name?: string | undefined;
  readonly Status?: string | undefined;
}

export interface SimCreateKeySigningKeyCommandOutput {
  readonly ChangeInfo?: SimRoute53ChangeInfo | undefined;
  readonly KeySigningKey?: SimRoute53KeySigningKeyView | undefined;
  readonly Location?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Route53 key-signing key command input.
 *
 * ActivateKeySigningKey, DeactivateKeySigningKey and DeleteKeySigningKey all
 * take the same two fields and answer with the same change info.
 */
export interface SimKeySigningKeyCommand {
  readonly input: SimKeySigningKeyCommandInput;
}

export interface SimKeySigningKeyCommandInput {
  readonly HostedZoneId?: string | undefined;
  readonly Name?: string | undefined;
}

export interface SimKeySigningKeyCommandOutput {
  readonly ChangeInfo?: SimRoute53ChangeInfo | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Route53 zone signing command input.
 *
 * EnableHostedZoneDNSSEC and DisableHostedZoneDNSSEC share it.
 */
export interface SimHostedZoneDnssecCommand {
  readonly input: SimHostedZoneDnssecCommandInput;
}

export interface SimHostedZoneDnssecCommandInput {
  readonly HostedZoneId?: string | undefined;
}

export interface SimHostedZoneDnssecCommandOutput {
  readonly ChangeInfo?: SimRoute53ChangeInfo | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Route53 GetDNSSEC command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/route-53/command/GetDNSSECCommand/
 */
export interface SimGetDnssecCommand {
  readonly input: SimGetDnssecCommandInput;
}

export interface SimGetDnssecCommandInput {
  readonly HostedZoneId?: string | undefined;
}

export interface SimRoute53DnssecStatus {
  readonly ServeSignature?: SimRoute53ServeSignature | undefined;
  readonly StatusMessage?: string | undefined;
}

export interface SimGetDnssecCommandOutput {
  readonly Status?: SimRoute53DnssecStatus | undefined;
  readonly KeySigningKeys?: readonly SimRoute53KeySigningKeyView[] | undefined;
  readonly $metadata: SimResponseMetadata;
}
