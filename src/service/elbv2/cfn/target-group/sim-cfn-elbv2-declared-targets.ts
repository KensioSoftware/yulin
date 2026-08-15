import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimElbV2TargetDescription } from "../../target-group/sim-elbv2-target.js";
import type { SimCfnElbV2PropertyReader } from "../property/sim-cfn-elbv2-property-reader.js";

/**
 * The targets a target group Resource declares, read one entry at a time.
 *
 * Each entry is read rather than handed on as it was written, because a
 * target's `Port` is a number the template may have carried as a string, and a
 * target registered on the string `"80"` would be a different target from one
 * registered on `80`.
 */
export function simCfnElbV2DeclaredTargets(
  reader: SimCfnElbV2PropertyReader,
): readonly SimElbV2TargetDescription[] | undefined {
  const declared = reader.structures<SimCfnTemplateValueRecord>("Targets");

  if (declared === undefined) {
    return undefined;
  }

  return declared.map((entry, index) =>
    simCfnElbV2DeclaredTarget(reader, entry, index),
  );
}

/**
 * One declared target.
 *
 * An entry with no `Id` is left as it is rather than refused here, so the
 * refusal comes from the same place an SDK caller's would.
 */
function simCfnElbV2DeclaredTarget(
  reader: SimCfnElbV2PropertyReader,
  entry: SimCfnTemplateValueRecord,
  index: number,
): SimElbV2TargetDescription {
  const field = `Targets entry ${String(index)}`;

  return {
    Id: simCfnElbV2TargetText(reader, entry, field, "Id"),
    Port: simCfnElbV2TargetPort(reader, entry, field),
    AvailabilityZone: simCfnElbV2TargetText(
      reader,
      entry,
      field,
      "AvailabilityZone",
    ),
  };
}

/**
 * One string field of a declared target, if it names one.
 */
function simCfnElbV2TargetText(
  reader: SimCfnElbV2PropertyReader,
  entry: SimCfnTemplateValueRecord,
  field: string,
  name: string,
): string | undefined {
  // oxlint-disable-next-line security/detect-object-injection -- fixed names.
  const value = entry[name];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw reader.refuse(`${field} ${name} is a string`);
  }

  return value;
}

/**
 * The port one declared target names, if it names one.
 */
function simCfnElbV2TargetPort(
  reader: SimCfnElbV2PropertyReader,
  entry: SimCfnTemplateValueRecord,
  field: string,
): number | undefined {
  const port = entry["Port"];

  if (port === undefined) {
    return undefined;
  }

  if (typeof port === "number") {
    return port;
  }

  if (typeof port === "string" && Number.isSafeInteger(Number(port))) {
    return Number(port);
  }

  throw reader.refuse(`${field} Port is a number`);
}
