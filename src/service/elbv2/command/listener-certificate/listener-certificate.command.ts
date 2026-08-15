import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimElbV2Certificate } from "../sim-elbv2-shared.command.js";

/**
 * Minimal structural sim ELBv2 AddListenerCertificates command.
 */
export interface SimAddListenerCertificatesCommand {
  readonly input: SimAddListenerCertificatesCommandInput;
}

/**
 * Minimal structural sim ELBv2 AddListenerCertificates input.
 *
 * https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_AddListenerCertificates.html
 */
export interface SimAddListenerCertificatesCommandInput {
  readonly ListenerArn?: string | undefined;
  readonly Certificates?: readonly SimElbV2Certificate[] | undefined;
}

/**
 * Minimal structural sim ELBv2 AddListenerCertificates output.
 */
export interface SimAddListenerCertificatesCommandOutput {
  readonly Certificates?: readonly SimElbV2Certificate[] | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim ELBv2 RemoveListenerCertificates command.
 */
export interface SimRemoveListenerCertificatesCommand {
  readonly input: SimRemoveListenerCertificatesCommandInput;
}

/**
 * Minimal structural sim ELBv2 RemoveListenerCertificates input.
 */
export interface SimRemoveListenerCertificatesCommandInput {
  readonly ListenerArn?: string | undefined;
  readonly Certificates?: readonly SimElbV2Certificate[] | undefined;
}

/**
 * Minimal structural sim ELBv2 RemoveListenerCertificates output.
 */
export interface SimRemoveListenerCertificatesCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim ELBv2 DescribeListenerCertificates command.
 */
export interface SimDescribeListenerCertificatesCommand {
  readonly input: SimDescribeListenerCertificatesCommandInput;
}

/**
 * Minimal structural sim ELBv2 DescribeListenerCertificates input.
 */
export interface SimDescribeListenerCertificatesCommandInput {
  readonly ListenerArn?: string | undefined;
  readonly Marker?: string | undefined;
  readonly PageSize?: number | undefined;
}

/**
 * Minimal structural sim ELBv2 DescribeListenerCertificates output.
 */
export interface SimDescribeListenerCertificatesCommandOutput {
  readonly Certificates?: readonly SimElbV2Certificate[] | undefined;
  readonly NextMarker?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}
