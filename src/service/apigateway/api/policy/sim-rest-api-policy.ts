import { jsonParse, jsonStringify } from "../../../../util/type-guard/json.js";
import type {
  SimIamPolicyDocument,
  SimIamPolicyDocumentStatement,
} from "../../../iam/policy/sim-iam-policy.js";
import { SimIamPolicyDocumentValidator } from "../../../iam/validate/sim-iam-policy-document-validator.js";
import { SimApiGatewayBadRequest } from "../../error/sim-api-gateway.error.js";
import type { SimRestApi } from "../sim-rest-api.js";

const validator: SimIamPolicyDocumentValidator =
  new SimIamPolicyDocumentValidator();

/**
 * The prefix a resource policy may write in place of the API's own ARN.
 */
const shorthandPrefix = "execute-api:";

/**
 * The resource policy of one REST API.
 *
 * A `Resource` written as `execute-api:/...` names the API the policy is
 * attached to. API Gateway expands it to the API's ARN when the policy is set,
 * and so does this. The document is evaluated by sim IAM as the API's resource
 * policy whenever a request reaches a method.
 */
export class SimRestApiPolicy {
  private constructor(public readonly document: SimIamPolicyDocument) {}

  /**
   * Read a policy as `CreateRestApi` or `UpdateRestApi` is given it, refusing
   * one that is not an IAM policy document.
   *
   * `apiArn` is the ARN of the API without a trailing path, such as
   * `arn:aws:execute-api:us-east-1:111111111111:a1b2c3d4e5`.
   */
  static parse(value: string, apiArn: string): SimRestApiPolicy {
    const document = parsedDocument(value);

    return new SimRestApiPolicy({
      ...document,
      Statement: statementsOf(document).map((statement) =>
        expandedStatement(statement, apiArn),
      ),
    });
  }

  /**
   * The policy as `GetRestApi` reports it.
   *
   * API Gateway answers with the JSON document's quotes escaped, so a client
   * has to unescape it before parsing it. This follows it.
   */
  value(): string {
    return jsonStringify(this.document).replaceAll('"', String.raw`\"`);
  }
}

/**
 * The resource policy a value sets on an API, or none for an empty value.
 */
export function simRestApiParsedPolicy(
  restApi: SimRestApi,
  value: string | undefined,
): SimRestApiPolicy | undefined {
  return value === undefined || value === ""
    ? undefined
    : SimRestApiPolicy.parse(value, restApi.arn);
}

/**
 * Attach a resource policy to an API, or remove the one it holds with an
 * empty value.
 */
export function simRestApiReplacePolicy(
  restApi: SimRestApi,
  value: string | undefined,
): void {
  restApi.policy = simRestApiParsedPolicy(restApi, value);
}

const invalidPolicy = (): SimApiGatewayBadRequest =>
  new SimApiGatewayBadRequest(
    "Invalid policy document. Please check the policy syntax and ensure " +
      "that Principals are valid.",
  );

/**
 * Read a policy document, refusing one IAM refuses and one with a statement
 * naming no principal, which every resource policy statement has to name.
 */
function parsedDocument(value: string): SimIamPolicyDocument {
  let document: SimIamPolicyDocument;

  try {
    validator.validateRequired(value);
    document = jsonParse(value);
  } catch {
    throw invalidPolicy();
  }

  if (
    statementsOf(document).some(
      (statement) =>
        statement.Principal === undefined &&
        statement.NotPrincipal === undefined,
    )
  ) {
    throw invalidPolicy();
  }

  return document;
}

function statementsOf(
  document: SimIamPolicyDocument,
): readonly SimIamPolicyDocumentStatement[] {
  const { Statement } = document;

  return Statement === undefined ? [] : [Statement].flat();
}

function expandedStatement(
  statement: SimIamPolicyDocumentStatement,
  apiArn: string,
): SimIamPolicyDocumentStatement {
  return {
    ...statement,
    ...(statement.Resource !== undefined && {
      Resource: expandedResources(statement.Resource, apiArn),
    }),
    ...(statement.NotResource !== undefined && {
      NotResource: expandedResources(statement.NotResource, apiArn),
    }),
  };
}

function expandedResources(
  resources: string | readonly string[],
  apiArn: string,
): string | readonly string[] {
  const expand = (resource: string): string =>
    resource.startsWith(shorthandPrefix)
      ? `${apiArn}${resource.slice(shorthandPrefix.length)}`
      : resource;

  return typeof resources === "string"
    ? expand(resources)
    : resources.map((resource) => expand(resource));
}
