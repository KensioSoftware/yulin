import { normaliseUserPath } from "../../user/sim-iam-user-path.js";

/**
 * What a rename leaves an entity called, and where.
 */
export interface SimIamRenamed {
  readonly name: string;
  readonly path: string;
}

/**
 * The name and path an entity has after a rename, keeping whichever of the
 * two the command leaves out.
 */
export function simIamRenamed(
  current: SimIamRenamed,
  name: string | undefined,
  path: string | undefined,
): SimIamRenamed {
  return {
    name: name ?? current.name,
    path: path === undefined ? current.path : normaliseUserPath(path),
  };
}
