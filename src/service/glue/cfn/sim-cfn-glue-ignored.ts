import type { SimCfnPropertyIgnorer } from "../../cloudformation/resource/ignore/sim-cfn-ignored-property.type.js";
import type { SimCfnGlueRecord } from "./sim-cfn-glue-record.js";

interface SimCfnGlueUnknownProperties {
  readonly ignorer: SimCfnPropertyIgnorer;
  readonly fields: SimCfnGlueRecord;
  readonly known: ReadonlySet<string>;
  readonly owner: string;
  readonly reasons?: ReadonlyMap<string, string>;
}

/**
 * Record every property of a nested Glue shape that is left unread.
 *
 * A name in the reasons map is a real AWS property this simulation has no
 * behaviour for. Any other name is one it has never heard of, which is usually
 * a typo in the template.
 */
export function recordUnreadGlueProperties(
  properties: SimCfnGlueUnknownProperties,
): void {
  const { fields, known, owner, reasons } = properties;

  for (const name of fields.keys()) {
    if (known.has(name)) {
      continue;
    }

    const reason = reasons?.get(name);

    properties.ignorer.ignoreProperty(
      `${fields.path}.${name}`,
      reason === undefined
        ? `${name} is not a ${owner} property simulated Glue knows about, ` +
            `so it is left out`
        : `${name} is a real ${owner} property simulated Glue does not act ` +
            `on: ${reason}`,
    );
  }
}
