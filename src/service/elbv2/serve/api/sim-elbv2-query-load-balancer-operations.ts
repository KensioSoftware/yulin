import type { SimQueryOperations } from "../../../../serve/http/api/query/sim-query-operation.js";
import type { SimQueryOutput } from "../../../../serve/http/api/query/sim-query-result.js";
import {
  queryList,
  queryMembers,
} from "../../../../serve/http/api/query/sim-query-result.js";
import {
  elbV2QueryPagingInput,
  elbV2QueryTags,
  elbV2QueryValues,
} from "./sim-elbv2-query-input.js";
import {
  elbV2QueryNextMarker,
  elbV2QueryStructure,
} from "./sim-elbv2-query-result.js";

/**
 * The members ELB describes one load balancer with.
 */
const loadBalancerMembers = [
  "LoadBalancerArn",
  "LoadBalancerName",
  "DNSName",
  "CanonicalHostedZoneId",
  "CreatedTime",
  "Scheme",
  "Type",
  "IpAddressType",
];

/**
 * The load balancer operations simulated ELBv2 serves over the Query protocol.
 */
export function simElbV2QueryLoadBalancerOperations(): SimQueryOperations {
  return new Map([
    [
      "CreateLoadBalancer",
      {
        input: (fields): Record<string, unknown> => ({
          Name: fields.text("Name"),
          Scheme: fields.text("Scheme"),
          Type: fields.text("Type"),
          IpAddressType: fields.text("IpAddressType"),
          Subnets: elbV2QueryValues(fields, "Subnets"),
          SubnetMappings: fields.list("SubnetMappings", (mapping) => ({
            SubnetId: mapping.text("SubnetId"),
            AllocationId: mapping.text("AllocationId"),
          })),
          SecurityGroups: elbV2QueryValues(fields, "SecurityGroups"),
          Tags: elbV2QueryTags(fields),
        }),
        result: loadBalancerListing,
      },
    ],
    [
      "DescribeLoadBalancers",
      {
        input: (fields): Record<string, unknown> => ({
          ...elbV2QueryPagingInput(fields),
          LoadBalancerArns: elbV2QueryValues(fields, "LoadBalancerArns"),
          Names: elbV2QueryValues(fields, "Names"),
        }),
        result: (output): string =>
          loadBalancerListing(output) + elbV2QueryNextMarker(output),
      },
    ],
    [
      "DeleteLoadBalancer",
      {
        input: (fields): Record<string, unknown> => ({
          LoadBalancerArn: fields.text("LoadBalancerArn"),
        }),
        result: (): string => "",
      },
    ],
  ]);
}

function loadBalancerListing(output: SimQueryOutput): string {
  return queryList(
    output,
    "LoadBalancers",
    (loadBalancer) =>
      queryMembers(loadBalancer, loadBalancerMembers) +
      elbV2QueryStructure(loadBalancer, "State", (state) =>
        queryMembers(state, ["Code"]),
      ),
  );
}
