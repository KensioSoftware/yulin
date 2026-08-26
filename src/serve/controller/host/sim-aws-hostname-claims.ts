/**
 * The hostnames simulated resources have claimed, across every service that
 * hands one out.
 *
 * A public hostname is unique across the whole of AWS rather than within one
 * service. A Cognito user pool custom domain and an API Gateway custom domain
 * cannot both answer on `auth.example.com`, and real AWS refuses the second
 * with a message about the CNAME already being associated with another
 * resource. Each registry enforces uniqueness among its own domains, and this
 * is what stops one service taking a hostname another already answers on.
 *
 * Resolution asks the claimants in a fixed order, so without this the second
 * claim would be accepted and then never reached.
 */
export class SimAwsHostnameClaims {
  private readonly claimed = new Set<string>();

  /**
   * Whether a hostname has already been claimed.
   */
  isClaimed(hostname: string): boolean {
    return this.claimed.has(hostname.toLowerCase());
  }

  /**
   * Record a hostname as claimed.
   */
  claim(hostname: string): void {
    this.claimed.add(hostname.toLowerCase());
  }

  /**
   * Give a hostname up, which is what deleting the resource holding it does.
   */
  release(hostname: string): void {
    this.claimed.delete(hostname.toLowerCase());
  }
}
