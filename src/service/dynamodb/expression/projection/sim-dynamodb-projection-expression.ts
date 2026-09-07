import { SimDynamoDbDocumentPathParser } from "../sim-dynamodb-document-path-parser.js";
import type { SimDynamoDbDocumentPath } from "../sim-dynamodb-document-path.js";
import { simDynamoDbExpressionError } from "../sim-dynamodb-expression-error.js";
import type { SimDynamoDbExpressionParameterInput } from "../sim-dynamodb-expression-parameters.js";
import { SimDynamoDbExpressionParameters } from "../sim-dynamodb-expression-parameters.js";
import type { SimDynamoDbExpressionAttributes } from "../sim-dynamodb-expression-attributes.js";
import { SimDynamoDbExpressionTokens } from "../sim-dynamodb-expression-tokens.js";
import { SimDynamoDbProjection } from "./sim-dynamodb-projection.js";

const expressionName = "ProjectionExpression";

interface SimDynamoDbProjectionRequest extends SimDynamoDbExpressionParameterInput {
  readonly ProjectionExpression?: string | undefined;
}

/**
 * What a request's ProjectionExpression said, once it has been read.
 */
export interface SimDynamoDbProjectionRead {
  readonly projection: SimDynamoDbProjection | undefined;

  /** The top-level attributes the expression named, for `dynamodb:Attributes`. */
  readonly attributes: readonly string[];
}

/**
 * Read the projection a request asks for, if it asks for one.
 *
 * A request with no ProjectionExpression asks for the whole item, so there is
 * nothing to project.
 *
 * This is the form for a request whose projection is its only expression, which
 * is every read that names one item or a list of them. A query or a scan can
 * carry a filter alongside its projection, and reads both against one set of
 * placeholders through `parseSimDynamoDbProjection`.
 */
export function readSimDynamoDbProjection(
  request: SimDynamoDbProjectionRequest,
): SimDynamoDbProjectionRead {
  const expression = request.ProjectionExpression;

  if (expression === undefined) {
    SimDynamoDbExpressionParameters.assertNoneWithout(request);

    return { projection: undefined, attributes: [] };
  }

  const parameters = new SimDynamoDbExpressionParameters(request);
  const projection = parseSimDynamoDbProjection(expression, parameters);

  parameters.assertAllUsed();

  return { projection, attributes: parameters.attributes.topLevel };
}

/**
 * Read one ProjectionExpression against placeholders that have already been
 * gathered.
 *
 * A query carries a key condition and may carry a filter alongside its
 * projection, and all three draw on the same `ExpressionAttributeNames`, so the
 * placeholders are checked once every expression has been read.
 */
export function parseSimDynamoDbProjection(
  expression: string,
  parameters: SimDynamoDbExpressionParameters,
): SimDynamoDbProjection {
  const paths = projectedPaths(
    SimDynamoDbExpressionTokens.of(
      expressionName,
      expression,
      "the expression names no attributes, and an expression cannot be empty",
    ),
    parameters.attributes,
  );

  return new SimDynamoDbProjection({ expressionName, paths });
}

/**
 * Read the comma-separated document paths a ProjectionExpression names.
 */
function projectedPaths(
  tokens: SimDynamoDbExpressionTokens,
  attributes: SimDynamoDbExpressionAttributes,
): readonly SimDynamoDbDocumentPath[] {
  const paths: SimDynamoDbDocumentPath[] = [];

  do {
    paths.push(
      new SimDynamoDbDocumentPathParser({ tokens, attributes }).parse(),
    );
  } while (tokens.takeSymbol(","));

  assertReadToEnd(tokens);

  return paths;
}

/**
 * Refuse an expression with something left over after its last path.
 */
function assertReadToEnd(tokens: SimDynamoDbExpressionTokens): void {
  const remaining = tokens.peek();

  if (remaining !== undefined) {
    throw simDynamoDbExpressionError(
      expressionName,
      `syntax error; '${remaining.text}' follows a document path, where a ` +
        `comma or the end of the expression was expected`,
    );
  }
}
