import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../template/value/sim-cfn-template-value.js";
import { isSamTemplateRecord } from "./sim-cfn-sam-record.js";

/**
 * The function properties SAM merges with their `Globals` default, key by key,
 * when both state one.
 */
const mergedMapNames: readonly string[] = [
  "Tags",
  "EventInvokeConfig",
  "DeadLetterQueue",
];

/**
 * The map properties a function states over a `Globals` default that states
 * them too, merged as SAM merges maps. A key the function states wins, and a
 * nested map is merged the same way, so a function stating only
 * `MaximumRetryAttempts` keeps the destination every function is given.
 */
export function samMergedMaps(
  globals: SimCfnTemplateValueRecord,
  properties: SimCfnTemplateValueRecord,
): SimCfnTemplateValueRecord {
  return Object.fromEntries(
    mergedMapNames.flatMap((name): [string, SimCfnTemplateValue][] => {
      const merged = mergedMap(
        new Map(Object.entries(globals)).get(name),
        new Map(Object.entries(properties)).get(name),
      );

      return merged === undefined ? [] : [[name, merged]];
    }),
  );
}

function mergedMap(
  global: SimCfnTemplateValue | undefined,
  own: SimCfnTemplateValue | undefined,
): SimCfnTemplateValueRecord | undefined {
  if (!isSamTemplateRecord(global) || !isSamTemplateRecord(own)) {
    return undefined;
  }

  const globalEntries = new Map(Object.entries(global));

  return {
    ...global,
    ...Object.fromEntries(
      Object.entries(own).map(([key, value]): [string, SimCfnTemplateValue] => [
        key,
        mergedMap(globalEntries.get(key), value) ?? value,
      ]),
    ),
  };
}
