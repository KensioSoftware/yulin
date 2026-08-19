import type { SimQueryFields } from "../../../../serve/http/api/query/sim-query-request.js";
import type { SimQueryOutput } from "../../../../serve/http/api/query/sim-query-result.js";
import {
  queryList,
  queryMembers,
} from "../../../../serve/http/api/query/sim-query-result.js";
import { elbV2QueryNumber, elbV2QueryStated } from "./sim-elbv2-query-input.js";
import { elbV2QueryStructure } from "./sim-elbv2-query-result.js";

/**
 * The members a redirect action states where it sends a client with.
 */
const redirectMembers = [
  "Protocol",
  "Port",
  "Host",
  "Path",
  "Query",
  "StatusCode",
];

/**
 * Read the actions a listener or a rule was given.
 *
 * A listener names its own under `DefaultActions` and a rule under `Actions`,
 * and both hold the same shape, so the field to read is passed in.
 */
export function elbV2QueryActions(
  fields: SimQueryFields,
  name: string,
): readonly Record<string, unknown>[] | undefined {
  return fields.list(name, (action) => ({
    Type: action.text("Type"),
    Order: elbV2QueryNumber(action, "Order"),
    TargetGroupArn: action.text("TargetGroupArn"),
    ForwardConfig: elbV2QueryStated({
      TargetGroups: action.list("ForwardConfig.TargetGroups", (tuple) => ({
        TargetGroupArn: tuple.text("TargetGroupArn"),
        Weight: elbV2QueryNumber(tuple, "Weight"),
      })),
    }),
    FixedResponseConfig: elbV2QueryStated({
      MessageBody: action.text("FixedResponseConfig.MessageBody"),
      StatusCode: action.text("FixedResponseConfig.StatusCode"),
      ContentType: action.text("FixedResponseConfig.ContentType"),
    }),
    RedirectConfig: elbV2QueryStated(
      Object.fromEntries(
        redirectMembers.map((member) => [
          member,
          action.text(`RedirectConfig.${member}`),
        ]),
      ),
    ),
  }));
}

/**
 * Write one action as ELB reports it back.
 */
export function elbV2QueryActionMembers(action: SimQueryOutput): string {
  return (
    queryMembers(action, ["Type", "Order", "TargetGroupArn"]) +
    elbV2QueryStructure(action, "ForwardConfig", (forward) =>
      queryList(forward, "TargetGroups", (tuple) =>
        queryMembers(tuple, ["TargetGroupArn", "Weight"]),
      ),
    ) +
    elbV2QueryStructure(action, "FixedResponseConfig", (fixed) =>
      queryMembers(fixed, ["MessageBody", "StatusCode", "ContentType"]),
    ) +
    elbV2QueryStructure(action, "RedirectConfig", (redirect) =>
      queryMembers(redirect, redirectMembers),
    )
  );
}
