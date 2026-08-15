import {
  SimElbV2DuplicateLoadBalancerNameException,
  SimElbV2LoadBalancerNotFoundException,
} from "../error/sim-elbv2.error.js";
import type { SimElbV2Registry } from "../registry/sim-elbv2-registry.js";
import type { SimElbV2LoadBalancer } from "./sim-elbv2-load-balancer.js";

interface SimElbV2LoadBalancerStoreProperties {
  readonly registry: SimElbV2Registry;
}

/**
 * The load balancers of one simulated ELBv2 scope.
 *
 * A name is unique within an account and region on real ELB rather than
 * globally, which is the same scope this store is created in, so holding the
 * names here is all that uniqueness needs.
 *
 * A DNS name is not scoped that way: a request arriving at one has no account
 * to start from. Storing and forgetting a load balancer therefore also tells
 * the cross-scope registry, so the two cannot disagree about which names
 * answer.
 */
export class SimElbV2LoadBalancerStore {
  private readonly loadBalancers = new Map<string, SimElbV2LoadBalancer>();
  private readonly registry: SimElbV2Registry;
  private sequence = 0;

  constructor(properties: SimElbV2LoadBalancerStoreProperties) {
    this.registry = properties.registry;
  }

  /**
   * Every load balancer in this scope, in creation order.
   */
  get all(): readonly SimElbV2LoadBalancer[] {
    return this.loadBalancers.values().toArray();
  }

  /**
   * Take the next id for a load balancer about to be created.
   */
  nextSequence(): number {
    this.sequence += 1;
    return this.sequence;
  }

  /**
   * Take the next number for the DNS name of a load balancer about to be
   * created.
   *
   * This one comes from the registry rather than from this store, because a
   * DNS name has to be unique across every scope while an ARN id only has to
   * be unique within one.
   */
  nextDnsSequence(): number {
    return this.registry.nextDnsSequence();
  }

  /**
   * Refuse a name another load balancer in this scope already holds.
   */
  requireNameAvailable(name: string): void {
    if (this.findByName(name) !== undefined) {
      throw new SimElbV2DuplicateLoadBalancerNameException(
        `A load balancer named '${name}' already exists in this account and ` +
          `region`,
      );
    }
  }

  /**
   * Store a created load balancer.
   */
  put(loadBalancer: SimElbV2LoadBalancer): void {
    this.loadBalancers.set(loadBalancer.arn, loadBalancer);
    this.registry.register(loadBalancer);
  }

  /**
   * Find a load balancer by name.
   */
  findByName(name: string): SimElbV2LoadBalancer | undefined {
    return this.all.find((loadBalancer) => loadBalancer.name === name);
  }

  /**
   * Find the load balancer answering on a DNS name.
   */
  findByDnsName(dnsName: string): SimElbV2LoadBalancer | undefined {
    const wanted = dnsName.toLowerCase();

    return this.all.find(
      (loadBalancer) => loadBalancer.dnsName.toLowerCase() === wanted,
    );
  }

  /**
   * Resolve a load balancer by ARN, or refuse.
   */
  requireByArn(arn: string): SimElbV2LoadBalancer {
    const found = this.loadBalancers.get(arn);

    if (found === undefined) {
      throw new SimElbV2LoadBalancerNotFoundException(
        `No sim ELBv2 load balancer with ARN ${arn}`,
      );
    }

    return found;
  }

  /**
   * Resolve a load balancer by name, or refuse.
   */
  requireByName(name: string): SimElbV2LoadBalancer {
    const found = this.findByName(name);

    if (found === undefined) {
      throw new SimElbV2LoadBalancerNotFoundException(
        `No sim ELBv2 load balancer named ${name}`,
      );
    }

    return found;
  }

  /**
   * Forget a deleted load balancer.
   */
  remove(loadBalancer: SimElbV2LoadBalancer): void {
    this.loadBalancers.delete(loadBalancer.arn);
    this.registry.deregister(loadBalancer);
  }
}
