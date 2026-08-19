import type { SimQueryFields } from "../../../../serve/http/api/query/sim-query-request.js";
import type { SimQueryOutput } from "../../../../serve/http/api/query/sim-query-result.js";
import {
  queryMembers,
  queryScalarList,
} from "../../../../serve/http/api/query/sim-query-result.js";
import { elbV2QueryStated, elbV2QueryValues } from "./sim-elbv2-query-input.js";
import { elbV2QueryStructure } from "./sim-elbv2-query-result.js";

/**
 * The per-field configurations a condition states its values in.
 *
 * ELB takes a condition's values in two forms, a plain `Values` list and a
 * configuration named after the field, and a rule written by a stack may use
 * either. These are the two fields simulated ELBv2 matches on: a condition
 * naming any other is refused by the simulation, whichever form it arrives in.
 */
const valueConfigs = ["HostHeaderConfig", "PathPatternConfig"];

/**
 * Read the conditions a rule matches a request with.
 */
export function elbV2QueryConditions(
  fields: SimQueryFields,
): readonly Record<string, unknown>[] | undefined {
  return fields.list("Conditions", (condition) => ({
    ...Object.fromEntries(
      valueConfigs.map((config) => [
        config,
        elbV2QueryStated({
          Values: elbV2QueryValues(condition, `${config}.Values`),
        }),
      ]),
    ),
    Field: condition.text("Field"),
    Values: elbV2QueryValues(condition, "Values"),
  }));
}

/**
 * Write one condition as ELB reports it back.
 */
export function elbV2QueryConditionMembers(condition: SimQueryOutput): string {
  const configs = valueConfigs
    .map((config) =>
      elbV2QueryStructure(condition, config, (values) =>
        queryScalarList(values, "Values"),
      ),
    )
    .join("");

  return (
    queryMembers(condition, ["Field"]) +
    queryScalarList(condition, "Values") +
    configs
  );
}
