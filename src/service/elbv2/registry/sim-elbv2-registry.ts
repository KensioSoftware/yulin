import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimElbV2LoadBalancer } from "../load-balancer/sim-elbv2-load-balancer.js";

/**
 * Simulated ELBv2 cross-Account registry of load balancer DNS names.
 *
 * A request reaching a load balancer carries its DNS name and nothing else.
 * Simulated ELBv2 state is per Account and Region, and a host name says which
 * neither of those is, so this registry is the missing hop from a host name to
 * the scope holding the load balancer that answers on it.
 */
export class SimElbV2Registry {
  private readonly scopesByDnsName = new Map<
    string,
    SimAwsAccountRegionScope
  >();
  private dnsSequence = 0;

  /**
   * Take the next number for the DNS name of a load balancer about to be
   * created.
   *
   * It counts across the whole simulation rather than within one scope,
   * because a DNS name is not scoped: two Accounts each creating their first
   * `shop-alb` in one Region would otherwise be issued the same host name, and
   * only one of them could answer on it. Real ELB issues a name unique across
   * the whole of AWS for the same reason.
   */
  nextDnsSequence(): number {
    this.dnsSequence += 1;
    return this.dnsSequence;
  }

  /**
   * Register a created load balancer, so requests to its DNS name resolve.
   */
  register(loadBalancer: SimElbV2LoadBalancer): void {
    this.scopesByDnsName.set(
      loadBalancer.dnsName.toLowerCase(),
      loadBalancer.accountRegionScope,
    );
  }

  /**
   * Forget a deleted load balancer, so requests to its DNS name stop
   * resolving.
   */
  deregister(loadBalancer: SimElbV2LoadBalancer): void {
    this.scopesByDnsName.delete(loadBalancer.dnsName.toLowerCase());
  }

  /**
   * Get the Account and Region of the load balancer answering on a DNS name,
   * if one does.
   *
   * The Region is held rather than read back out of the host name, so nothing
   * has to take a real ELB name apart to route a request.
   */
  scopeForDnsName(dnsName: string): SimAwsAccountRegionScope | undefined {
    return this.scopesByDnsName.get(dnsName.toLowerCase());
  }
}
