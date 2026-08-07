/**
 * The hostname the URLs in a delivered message name.
 *
 * Real SNS puts `sns.<region>.amazonaws.com` in the `SigningCertURL` and the
 * `UnsubscribeURL` of every message it delivers. A simulated message names
 * `sns.<region>.yulin.invalid` instead, because neither URL can be fetched:
 * simulated SNS is not served over HTTP, and the certificate is handed out
 * in process by `SimSns.signingCertificate`.
 *
 * `.invalid` is the reserved top level domain for exactly this. A consumer that
 * does try to fetch one of these URLs fails to resolve it, rather than reaching
 * real AWS and being answered by a certificate that signed nothing here.
 *
 * This is a divergence a real signature verifier notices. `sns-validator`
 * hard-codes an `amazonaws.com` certificate host and fetches the URL itself, so
 * it cannot verify a simulated message as it stands. Verifying one means
 * checking the signature against the certificate `SimSns.signingCertificate`
 * hands over, which is what the docs show.
 */
export function simSnsHost(regionName: string): string {
  return `sns.${regionName}.yulin.invalid`;
}

/**
 * The URL a delivered message names to say how to stop receiving them.
 *
 * Real SNS carries this in every envelope, and it is the same shape here with
 * the simulated host in front of it.
 */
export function simSnsUnsubscribeUrl(
  regionName: string,
  subscriptionArn: string,
): string {
  return (
    `https://${simSnsHost(regionName)}/?Action=Unsubscribe` +
    `&SubscriptionArn=${encodeURIComponent(subscriptionArn)}`
  );
}
