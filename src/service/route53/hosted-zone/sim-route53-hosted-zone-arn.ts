import type { SimRoute53HostedZoneId } from "../command/create-hosted-zone/sim-route53-zone-id.js";

/**
 * Build the ARN for a Hosted Zone.
 *
 * Route53 is a global service, so hosted zone ARNs carry no region or account
 * segments. Zone-scoped commands authorize against this ARN, so the format
 * lives in one place rather than being repeated per command handler.
 */
export function simRoute53HostedZoneArn(
  hostedZoneId: SimRoute53HostedZoneId,
): string {
  return `arn:aws:route53:::hostedzone/${hostedZoneId}`;
}
