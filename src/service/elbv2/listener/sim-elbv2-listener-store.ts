import {
  SimElbV2DuplicateListenerException,
  SimElbV2ListenerNotFoundException,
} from "../error/sim-elbv2.error.js";
import type { SimElbV2Listener } from "./sim-elbv2-listener.js";

/**
 * The listeners of one simulated ELBv2 scope.
 *
 * Listeners belong to a load balancer, and are held here rather than on it so
 * that a describe by listener ARN needs no load balancer to start from, which
 * is how the SDK addresses them.
 */
export class SimElbV2ListenerStore {
  private readonly listeners = new Map<string, SimElbV2Listener>();
  private sequence = 0;

  /**
   * Every listener in this scope, in creation order.
   */
  get all(): readonly SimElbV2Listener[] {
    return this.listeners.values().toArray();
  }

  /**
   * Take the next id for a listener about to be created.
   */
  nextSequence(): number {
    this.sequence += 1;
    return this.sequence;
  }

  /**
   * Every listener on one load balancer.
   */
  forLoadBalancer(loadBalancerArn: string): readonly SimElbV2Listener[] {
    return this.all.filter(
      (listener) => listener.loadBalancerArn === loadBalancerArn,
    );
  }

  /**
   * Find the listener answering on one port of a load balancer.
   *
   * A port holds at most one listener, which is what makes a request's port
   * the whole of the question a load balancer asks about which listener takes
   * it.
   */
  findOnPort(
    loadBalancerArn: string,
    port: number,
  ): SimElbV2Listener | undefined {
    return this.forLoadBalancer(loadBalancerArn).find(
      (listener) => listener.port === port,
    );
  }

  /**
   * Refuse a port another listener on the same load balancer already answers
   * on.
   *
   * The listener being changed is passed when this is a modification, so a
   * request leaving a listener on the port it already holds is not a clash
   * with itself.
   */
  requirePortAvailable(
    loadBalancerArn: string,
    port: number,
    changing?: SimElbV2Listener,
  ): void {
    const clash = this.forLoadBalancer(loadBalancerArn).find(
      (listener) => listener.port === port && listener !== changing,
    );

    if (clash !== undefined) {
      throw new SimElbV2DuplicateListenerException(
        `A listener on port ${String(port)} already exists on this load ` +
          `balancer`,
      );
    }
  }

  /**
   * Store a created listener.
   */
  put(listener: SimElbV2Listener): void {
    this.listeners.set(listener.arn, listener);
  }

  /**
   * Resolve a listener by ARN, or refuse.
   */
  requireByArn(arn: string): SimElbV2Listener {
    const found = this.listeners.get(arn);

    if (found === undefined) {
      throw new SimElbV2ListenerNotFoundException(
        `No sim ELBv2 listener with ARN ${arn}`,
      );
    }

    return found;
  }

  /**
   * Forget a deleted listener.
   */
  remove(listener: SimElbV2Listener): void {
    this.listeners.delete(listener.arn);
  }
}
