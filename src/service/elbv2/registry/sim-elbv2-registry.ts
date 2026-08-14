import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { SimElbV2LoadBalancer } from "../load-balancer/sim-elbv2-load-balancer.js";

/**
 * Simulated ELBv2 cross-Account registry of load balancer DNS names.
 *
 * A request reaching a load balancer carries its DNS name and nothing else.
 * That name says which Region the load balancer is in, because real ELB puts
 * the Region in it, but it does not say which Account owns it. Simulated ELBv2
 * state is per Account and Region, so this registry is the missing hop from a
 * host name to the scope holding the load balancer that answers on it.
 */
export class SimElbV2Registry {
  private readonly accountIdsByDnsName = new Map<string, SimAwsAccountId>();

  /**
   * Register a created load balancer, so requests to its DNS name resolve.
   */
  register(loadBalancer: SimElbV2LoadBalancer): void {
    this.accountIdsByDnsName.set(
      loadBalancer.dnsName.toLowerCase(),
      loadBalancer.accountRegionScope.accountId,
    );
  }

  /**
   * Forget a deleted load balancer, so requests to its DNS name stop
   * resolving.
   */
  deregister(loadBalancer: SimElbV2LoadBalancer): void {
    this.accountIdsByDnsName.delete(loadBalancer.dnsName.toLowerCase());
  }

  /**
   * Get the Account that owns the load balancer answering on a DNS name, if
   * one does.
   */
  accountIdForDnsName(dnsName: string): SimAwsAccountId | undefined {
    return this.accountIdsByDnsName.get(dnsName.toLowerCase());
  }
}
