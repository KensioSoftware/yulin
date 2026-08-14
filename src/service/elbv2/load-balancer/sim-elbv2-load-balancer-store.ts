import {
  SimElbV2DuplicateLoadBalancerNameException,
  SimElbV2LoadBalancerNotFoundException,
} from "../error/sim-elbv2.error.js";
import type { SimElbV2LoadBalancer } from "./sim-elbv2-load-balancer.js";

/**
 * The load balancers of one simulated ELBv2 scope.
 *
 * A name is unique within an account and region on real ELB rather than
 * globally, which is the same scope this store is created in, so holding the
 * names here is all that uniqueness needs.
 */
export class SimElbV2LoadBalancerStore {
  private readonly loadBalancers = new Map<string, SimElbV2LoadBalancer>();
  private sequence = 0;

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
  }

  /**
   * Find a load balancer by name.
   */
  findByName(name: string): SimElbV2LoadBalancer | undefined {
    return this.all.find((loadBalancer) => loadBalancer.name === name);
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
  }
}
