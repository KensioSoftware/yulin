import type { JSONValue } from "../../../util/type-guard/json.js";
import {
  type SimStatesPathSegment,
  selectSimStatesPath,
} from "./sim-states-path-segment.js";
import { parseSimStatesReferencePath } from "./sim-states-reference-path.js";

/**
 * A path as it was written, and which document it reads.
 */
export interface SimStatesReadPath {
  readonly segments: readonly SimStatesPathSegment[];
  readonly fromContext: boolean;
}

/**
 * What a path rooted at the context object starts with.
 */
const contextRoot = "$$";

/**
 * Read a path that is allowed to read the context object.
 *
 * Amazon States Language roots a path at `$` for the value the state is
 * working on and at `$$` for the context object. Both are read the same way
 * once the root has said which of the two to read.
 */
export function parseSimStatesReadPath(path: string): SimStatesReadPath {
  if (path.startsWith(contextRoot)) {
    return {
      fromContext: true,
      segments: parseSimStatesReferencePath(
        `$${path.slice(contextRoot.length)}`,
      ),
    };
  }

  return { fromContext: false, segments: parseSimStatesReferencePath(path) };
}

/**
 * The value a path selects, from the state's data or from the context object.
 */
export function selectSimStatesReadPath(
  path: string,
  document: JSONValue,
  context: JSONValue,
): JSONValue | undefined {
  const read = parseSimStatesReadPath(path);

  return selectSimStatesPath(
    read.fromContext ? context : document,
    read.segments,
  );
}
