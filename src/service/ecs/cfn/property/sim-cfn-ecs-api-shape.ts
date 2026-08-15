import { isRecord } from "../../../../util/type-guard/record.js";

/**
 * The property names whose value is a map the user wrote, rather than a
 * structure ECS names the fields of.
 *
 * A Docker label, a log driver option and a volume driver option are all keys
 * the user chose, so lowering them would change the declaration rather than
 * translate it.
 */
const freeFormMapProperties: ReadonlySet<string> = new Set([
  "DockerLabels",
  "DriverOpts",
  "Labels",
  "Options",
]);

/**
 * The property names the ECS API does not simply lower the first letter of.
 *
 * They are the whole list this simulation knows about, and they are all in the
 * parts of a task definition nothing here acts on. A name not in it and not
 * covered by lowering the first letter is stored under the name lowering gives
 * it, which is why the mapping is a documented limitation rather than a claim
 * to be complete.
 */
const renamedProperties: ReadonlyMap<string, string> = new Map([
  ["EFSVolumeConfiguration", "efsVolumeConfiguration"],
  [
    "FSxWindowsFileServerVolumeConfiguration",
    "fsxWindowsFileServerVolumeConfiguration",
  ],
  ["ProxyConfigurationProperties", "properties"],
]);

/**
 * A CloudFormation property value as the ECS API spells it.
 *
 * CloudFormation writes an ECS declaration in the API's own shape with the
 * first letter of every name upper cased, so translating is mechanical: lower
 * the first letter of each key, all the way down. The two exceptions are the
 * handful of names the API spells differently and the maps whose keys the user
 * wrote, both of which are named above.
 *
 * Nothing here reads the meaning of what it translates. A task definition is a
 * declaration, and the point of translating it is that a described revision
 * reports what the template declared in the words the SDK would have used.
 */
export function simCfnEcsApiShape(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => simCfnEcsApiShape(entry));
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([name, entry]) => [
      simCfnEcsApiPropertyName(name),
      simCfnEcsApiPropertyValue(name, entry),
    ]),
  );
}

/**
 * One property name as the ECS API spells it.
 */
function simCfnEcsApiPropertyName(name: string): string {
  return (
    renamedProperties.get(name) ??
    `${name.charAt(0).toLowerCase()}${name.slice(1)}`
  );
}

/**
 * One property value, translated unless the property holds a map of the user's
 * own keys.
 */
function simCfnEcsApiPropertyValue(name: string, value: unknown): unknown {
  if (freeFormMapProperties.has(name)) {
    return value;
  }

  return simCfnEcsApiShape(value);
}
