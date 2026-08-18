import type { SimQueryOperations } from "../../../../serve/http/api/query/sim-query-operation.js";
import type { SimQueryOutput } from "../../../../serve/http/api/query/sim-query-result.js";
import {
  queryList,
  queryMembers,
} from "../../../../serve/http/api/query/sim-query-result.js";
import {
  elbV2QueryActionMembers,
  elbV2QueryActions,
} from "./sim-elbv2-query-action.js";
import {
  elbV2QueryConditionMembers,
  elbV2QueryConditions,
} from "./sim-elbv2-query-condition.js";
import {
  elbV2QueryNumber,
  elbV2QueryPagingInput,
  elbV2QueryTags,
  elbV2QueryValues,
} from "./sim-elbv2-query-input.js";
import { elbV2QueryNextMarker } from "./sim-elbv2-query-result.js";

/**
 * The rule operations simulated ELBv2 serves over the Query protocol.
 */
export function simElbV2QueryRuleOperations(): SimQueryOperations {
  return new Map([
    [
      "CreateRule",
      {
        input: (fields): Record<string, unknown> => ({
          ListenerArn: fields.text("ListenerArn"),
          Priority: elbV2QueryNumber(fields, "Priority"),
          Conditions: elbV2QueryConditions(fields),
          Actions: elbV2QueryActions(fields, "Actions"),
          Tags: elbV2QueryTags(fields),
        }),
        result: ruleListing,
      },
    ],
    [
      "DescribeRules",
      {
        input: (fields): Record<string, unknown> => ({
          ...elbV2QueryPagingInput(fields),
          ListenerArn: fields.text("ListenerArn"),
          RuleArns: elbV2QueryValues(fields, "RuleArns"),
        }),
        result: (output): string =>
          ruleListing(output) + elbV2QueryNextMarker(output),
      },
    ],
    [
      "ModifyRule",
      {
        input: (fields): Record<string, unknown> => ({
          RuleArn: fields.text("RuleArn"),
          Conditions: elbV2QueryConditions(fields),
          Actions: elbV2QueryActions(fields, "Actions"),
        }),
        result: ruleListing,
      },
    ],
    [
      "DeleteRule",
      {
        input: (fields): Record<string, unknown> => ({
          RuleArn: fields.text("RuleArn"),
        }),
        result: (): string => "",
      },
    ],
    [
      "SetRulePriorities",
      {
        input: (fields): Record<string, unknown> => ({
          RulePriorities: fields.list("RulePriorities", (pair) => ({
            RuleArn: pair.text("RuleArn"),
            Priority: elbV2QueryNumber(pair, "Priority"),
          })),
        }),
        result: ruleListing,
      },
    ],
  ]);
}

function ruleListing(output: SimQueryOutput): string {
  return queryList(
    output,
    "Rules",
    (rule) =>
      queryMembers(rule, ["RuleArn", "Priority", "IsDefault"]) +
      queryList(rule, "Conditions", elbV2QueryConditionMembers) +
      queryList(rule, "Actions", elbV2QueryActionMembers),
  );
}
