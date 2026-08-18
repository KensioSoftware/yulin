import type { SimQueryFields } from "../../../../serve/http/api/query/sim-query-request.js";
import type { SimQueryOperations } from "../../../../serve/http/api/query/sim-query-operation.js";
import type { SimQueryOutput } from "../../../../serve/http/api/query/sim-query-result.js";
import {
  queryList,
  queryMembers,
  queryScalarList,
} from "../../../../serve/http/api/query/sim-query-result.js";
import {
  elbV2QueryNumber,
  elbV2QueryPagingInput,
  elbV2QueryStated,
  elbV2QueryTags,
  elbV2QueryValues,
} from "./sim-elbv2-query-input.js";
import {
  elbV2QueryNextMarker,
  elbV2QueryStructure,
} from "./sim-elbv2-query-result.js";

/**
 * The health check members a target group is created or changed with, and
 * reports back.
 */
const healthCheckMembers = [
  "HealthCheckEnabled",
  "HealthCheckProtocol",
  "HealthCheckPort",
  "HealthCheckPath",
  "HealthCheckIntervalSeconds",
  "HealthCheckTimeoutSeconds",
  "HealthyThresholdCount",
  "UnhealthyThresholdCount",
];

/**
 * The members ELB describes one target group with, beyond its health check.
 */
const targetGroupMembers = [
  "TargetGroupArn",
  "TargetGroupName",
  "TargetType",
  "Protocol",
  "Port",
  "VpcId",
];

/**
 * The target group operations simulated ELBv2 serves over the Query protocol.
 */
export function simElbV2QueryTargetGroupOperations(): SimQueryOperations {
  return new Map([
    [
      "CreateTargetGroup",
      {
        input: (fields): Record<string, unknown> => ({
          ...healthCheckInput(fields),
          Name: fields.text("Name"),
          TargetType: fields.text("TargetType"),
          Protocol: fields.text("Protocol"),
          ProtocolVersion: fields.text("ProtocolVersion"),
          Port: elbV2QueryNumber(fields, "Port"),
          VpcId: fields.text("VpcId"),
          IpAddressType: fields.text("IpAddressType"),
          Tags: elbV2QueryTags(fields),
        }),
        result: targetGroupListing,
      },
    ],
    [
      "DescribeTargetGroups",
      {
        input: (fields): Record<string, unknown> => ({
          ...elbV2QueryPagingInput(fields),
          LoadBalancerArn: fields.text("LoadBalancerArn"),
          TargetGroupArns: elbV2QueryValues(fields, "TargetGroupArns"),
          Names: elbV2QueryValues(fields, "Names"),
        }),
        result: (output): string =>
          targetGroupListing(output) + elbV2QueryNextMarker(output),
      },
    ],
    [
      "ModifyTargetGroup",
      {
        input: (fields): Record<string, unknown> => ({
          ...healthCheckInput(fields),
          TargetGroupArn: fields.text("TargetGroupArn"),
        }),
        result: targetGroupListing,
      },
    ],
    [
      "DeleteTargetGroup",
      {
        input: (fields): Record<string, unknown> => ({
          TargetGroupArn: fields.text("TargetGroupArn"),
        }),
        result: (): string => "",
      },
    ],
  ]);
}

/**
 * Read the health check settings a create or a change carries.
 *
 * The intervals and the thresholds are counts, and a matcher is the one nested
 * structure among them.
 */
function healthCheckInput(fields: SimQueryFields): Record<string, unknown> {
  return {
    HealthCheckEnabled: fields.flag("HealthCheckEnabled"),
    HealthCheckProtocol: fields.text("HealthCheckProtocol"),
    HealthCheckPort: fields.text("HealthCheckPort"),
    HealthCheckPath: fields.text("HealthCheckPath"),
    HealthCheckIntervalSeconds: elbV2QueryNumber(
      fields,
      "HealthCheckIntervalSeconds",
    ),
    HealthCheckTimeoutSeconds: elbV2QueryNumber(
      fields,
      "HealthCheckTimeoutSeconds",
    ),
    HealthyThresholdCount: elbV2QueryNumber(fields, "HealthyThresholdCount"),
    UnhealthyThresholdCount: elbV2QueryNumber(
      fields,
      "UnhealthyThresholdCount",
    ),
    Matcher: elbV2QueryStated({
      HttpCode: fields.text("Matcher.HttpCode"),
      GrpcCode: fields.text("Matcher.GrpcCode"),
    }),
  };
}

function targetGroupListing(output: SimQueryOutput): string {
  return queryList(
    output,
    "TargetGroups",
    (targetGroup) =>
      queryMembers(targetGroup, [
        ...targetGroupMembers,
        ...healthCheckMembers,
      ]) +
      elbV2QueryStructure(targetGroup, "Matcher", (matcher) =>
        queryMembers(matcher, ["HttpCode", "GrpcCode"]),
      ) +
      queryScalarList(targetGroup, "LoadBalancerArns"),
  );
}
