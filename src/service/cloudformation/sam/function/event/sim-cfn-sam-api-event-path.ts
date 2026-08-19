import { createHash } from "node:crypto";

import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../template/value/sim-cfn-template-value.js";

/**
 * The path an `Api` event states, as the segments under the API's root.
 *
 * `/rates/{currency}` is two segments, and `/` is none. A REST API spells a
 * path over one Resource per segment, where an HTTP API route states the whole
 * path as its key, so this is where the two expansions part company.
 */
export function samApiEventPathParts(path: string): readonly string[] {
  return path.split("/").filter((part) => part.length > 0);
}

/**
 * One AWS::ApiGateway::Resource per node the event's path needs, each naming
 * its parent by `ParentId` and the top of the tree by `RootResourceId`.
 *
 * Nodes are keyed by the path they spell, so two events under one path share
 * the node rather than declaring it twice. That is what puts `/rates` and
 * `/rates/{currency}` on one branch of one tree, whether the events are on one
 * function or spread over several.
 *
 * A node carries no `Condition`, the way the implicit API carries none. The
 * tree is shared, and the other events on it may be conditioned differently or
 * not at all. A path a conditioned-out function asked for is a node with no
 * method on it, which answers nothing.
 */
export function samApiEventPathResources(
  apiLogicalId: string,
  path: readonly string[],
): Record<string, SimCfnTemplateValue> {
  return Object.fromEntries(
    path.map((pathPart, index) => {
      const nodePath = path.slice(0, index + 1);

      return [
        samApiEventPathLogicalId(apiLogicalId, nodePath),
        {
          Type: "AWS::ApiGateway::Resource",
          Properties: {
            RestApiId: { Ref: apiLogicalId },
            ParentId: samApiEventResourceId(
              apiLogicalId,
              nodePath.slice(0, -1),
            ),
            PathPart: pathPart,
          },
        },
      ];
    }),
  );
}

/**
 * What names one node of the tree, which is the API's root resource for the
 * empty path and a `Ref` to the node's own Resource otherwise.
 */
export function samApiEventResourceId(
  apiLogicalId: string,
  path: readonly string[],
): SimCfnTemplateValueRecord {
  return path.length === 0
    ? { "Fn::GetAtt": [apiLogicalId, "RootResourceId"] }
    : { Ref: samApiEventPathLogicalId(apiLogicalId, path) };
}

/**
 * The logical ID of the Resource carrying one node of the tree.
 *
 * SAM writes its paths into a Swagger document and so names no Resource for
 * one, which leaves nothing here to match. The path is hashed the way SAM
 * hashes anything it has to build an identifier out of, because a path part is
 * `{currency}` or `{proxy+}` as often as it is a word, and every scheme that
 * spells those out either drops the punctuation that tells them apart or
 * produces an ID no reader gets anything from. Two events under one path hash
 * alike and converge on the node.
 */
function samApiEventPathLogicalId(
  apiLogicalId: string,
  path: readonly string[],
): string {
  const hash = createHash("sha1")
    .update(path.join("/"))
    .digest("hex")
    .slice(0, 10);

  return `${apiLogicalId}Resource${hash}`;
}
