import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import { SimDynamoDbDocumentPathParser } from "../sim-dynamodb-document-path-parser.js";
import type { SimDynamoDbDocumentPath } from "../sim-dynamodb-document-path.js";
import { simDynamoDbExpressionError } from "../sim-dynamodb-expression-error.js";
import { SimDynamoDbExpressionPlaceholders } from "../sim-dynamodb-expression-placeholders.js";
import { SimDynamoDbExpressionTokeniser } from "../sim-dynamodb-expression-tokeniser.js";
import { SimDynamoDbExpressionTokens } from "../sim-dynamodb-expression-tokens.js";
import { SimDynamoDbProjection } from "./sim-dynamodb-projection.js";

const expressionName = "ProjectionExpression";

interface SimDynamoDbProjectionRequest {
  readonly ProjectionExpression?: string | undefined;
  readonly ExpressionAttributeNames?:
    Readonly<Record<string, string>> | undefined;
}

/**
 * Read the projection a request asks for, if it asks for one.
 *
 * A request with no ProjectionExpression asks for the whole item, so there is
 * nothing to project. Names supplied without an expression to use them in are
 * refused, as real DynamoDB refuses them: nothing would ever read them, and a
 * request carrying them has almost always lost its expression somewhere.
 */
export function readSimDynamoDbProjection(
  request: SimDynamoDbProjectionRequest,
): SimDynamoDbProjection | undefined {
  const expression = request.ProjectionExpression;

  if (expression === undefined) {
    assertNoNamesWithoutExpression(request.ExpressionAttributeNames);

    return undefined;
  }

  const names = new SimDynamoDbExpressionPlaceholders({
    parameterName: "ExpressionAttributeNames",
    marker: "#",
    entries: request.ExpressionAttributeNames,
  });
  const paths = projectedPaths(expression, names);
  names.assertAllUsed();

  return new SimDynamoDbProjection({ expressionName, paths });
}

/**
 * Read the comma-separated document paths a ProjectionExpression names.
 */
function projectedPaths(
  expression: string,
  names: SimDynamoDbExpressionPlaceholders<string>,
): readonly SimDynamoDbDocumentPath[] {
  const tokens = new SimDynamoDbExpressionTokens({
    expressionName,
    tokens: new SimDynamoDbExpressionTokeniser({ expressionName }).tokenise(
      expression,
    ),
  });

  if (tokens.atEnd) {
    throw simDynamoDbExpressionError(
      expressionName,
      "the expression names no attributes, and an expression cannot be empty",
    );
  }

  const paths: SimDynamoDbDocumentPath[] = [];

  do {
    paths.push(new SimDynamoDbDocumentPathParser({ tokens, names }).parse());
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

/**
 * Refuse names defined for an expression the request does not carry.
 */
function assertNoNamesWithoutExpression(
  entries: Readonly<Record<string, string>> | undefined,
): void {
  if (Object.keys(entries ?? {}).length > 0) {
    throw new SimDynamoDbValidationException(
      "ExpressionAttributeNames can only be specified when using expressions, " +
        "and this request carries none",
    );
  }
}
