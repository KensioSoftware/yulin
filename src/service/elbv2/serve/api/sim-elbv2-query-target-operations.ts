import type { SimQueryFields } from "../../../../serve/http/api/query/sim-query-request.js";
import type { SimQueryOperations } from "../../../../serve/http/api/query/sim-query-operation.js";
import type { SimQueryOutput } from "../../../../serve/http/api/query/sim-query-result.js";
import {
  queryList,
  queryMembers,
} from "../../../../serve/http/api/query/sim-query-result.js";
import { elbV2QueryNumber } from "./sim-elbv2-query-input.js";
import { elbV2QueryStructure } from "./sim-elbv2-query-result.js";

/**
 * The members ELB names one target with.
 */
const targetMembers = ["Id", "Port", "AvailabilityZone"];

/**
 * The target operations simulated ELBv2 serves over the Query protocol.
 */
export function simElbV2QueryTargetOperations(): SimQueryOperations {
  return new Map([
    [
      "RegisterTargets",
      {
        input: targetsInput,
        result: (): string => "",
      },
    ],
    [
      "DeregisterTargets",
      {
        input: targetsInput,
        result: (): string => "",
      },
    ],
    [
      "DescribeTargetHealth",
      {
        input: targetsInput,
        result: targetHealthResult,
      },
    ],
  ]);
}

/**
 * Write the health ELB reports each target is in.
 *
 * Every target here is healthy, since nothing makes a request to one to find
 * out, so what this carries is the shape a caller reads a health check result
 * out of rather than a verdict.
 */
function targetHealthResult(output: SimQueryOutput): string {
  return queryList(
    output,
    "TargetHealthDescriptions",
    (described) =>
      elbV2QueryStructure(described, "Target", (target) =>
        queryMembers(target, targetMembers),
      ) +
      elbV2QueryStructure(described, "TargetHealth", (health) =>
        queryMembers(health, ["State", "Description"]),
      ),
  );
}

/**
 * The input all three target operations share: a target group, and the targets
 * in it the request is about.
 *
 * A describe that names none is asking about every target registered, which is
 * why an omitted list stays omitted rather than becoming an empty one.
 */
function targetsInput(fields: SimQueryFields): Record<string, unknown> {
  return {
    TargetGroupArn: fields.text("TargetGroupArn"),
    Targets: fields.list("Targets", (target) => ({
      Id: target.text("Id"),
      Port: elbV2QueryNumber(target, "Port"),
      AvailabilityZone: target.text("AvailabilityZone"),
    })),
  };
}
