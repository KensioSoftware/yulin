import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimElbV2LoadBalancerView } from "../../load-balancer/sim-elbv2-load-balancer.js";
import type { SimElbV2Tag } from "../sim-elbv2-shared.command.js";

/**
 * Minimal structural sim ELBv2 CreateLoadBalancer command.
 */
export interface SimCreateLoadBalancerCommand {
  readonly input: SimCreateLoadBalancerCommandInput;
}

/**
 * Minimal structural sim ELBv2 CreateLoadBalancer input.
 *
 * `Subnets`, `SubnetMappings` and `SecurityGroups` are here so a request
 * carrying them is accepted, and nothing is done with them: there is no
 * network in this simulation for them to place a load balancer on.
 *
 * https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_CreateLoadBalancer.html
 */
export interface SimCreateLoadBalancerCommandInput {
  readonly Name?: string | undefined;
  readonly Scheme?: string | undefined;
  readonly Type?: string | undefined;
  readonly IpAddressType?: string | undefined;
  readonly Subnets?: readonly string[] | undefined;
  readonly SubnetMappings?: readonly unknown[] | undefined;
  readonly SecurityGroups?: readonly string[] | undefined;
  readonly Tags?: readonly SimElbV2Tag[] | undefined;
}

/**
 * Minimal structural sim ELBv2 CreateLoadBalancer output.
 */
export interface SimCreateLoadBalancerCommandOutput {
  readonly LoadBalancers?: readonly SimElbV2LoadBalancerView[] | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim ELBv2 DescribeLoadBalancers command.
 */
export interface SimDescribeLoadBalancersCommand {
  readonly input: SimDescribeLoadBalancersCommandInput;
}

/**
 * Minimal structural sim ELBv2 DescribeLoadBalancers input.
 */
export interface SimDescribeLoadBalancersCommandInput {
  readonly LoadBalancerArns?: readonly string[] | undefined;
  readonly Names?: readonly string[] | undefined;
  readonly Marker?: string | undefined;
  readonly PageSize?: number | undefined;
}

/**
 * Minimal structural sim ELBv2 DescribeLoadBalancers output.
 */
export interface SimDescribeLoadBalancersCommandOutput {
  readonly LoadBalancers?: readonly SimElbV2LoadBalancerView[] | undefined;
  readonly NextMarker?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim ELBv2 DeleteLoadBalancer command.
 */
export interface SimDeleteLoadBalancerCommand {
  readonly input: SimDeleteLoadBalancerCommandInput;
}

/**
 * Minimal structural sim ELBv2 DeleteLoadBalancer input.
 */
export interface SimDeleteLoadBalancerCommandInput {
  readonly LoadBalancerArn?: string | undefined;
}

/**
 * Minimal structural sim ELBv2 DeleteLoadBalancer output.
 */
export interface SimDeleteLoadBalancerCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
