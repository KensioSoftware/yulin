import type { SimPayload2LambdaAuthorizer } from "../../../../serve/payload-2/sim-payload-2-event.type.js";
import { isRecord } from "../../../../util/type-guard/record.js";
import type { SimIamPolicyDocument } from "../../../iam/policy/sim-iam-policy.js";
import {
  SimHttpApiAdmitted,
  type SimHttpApiAuthorization,
  SimHttpApiRefused,
} from "../../api/authorizer/sim-http-api-authorization.js";
import type { SimHttpApiRequestAuthorizer } from "../../api/authorizer/sim-http-api-request-authorizer.js";
import { SimHttpApiAuthorizerPolicy } from "./sim-http-api-authorizer-policy.js";

/**
 * The one message a Lambda authorizer answers a 401 with.
 */
const unauthorizedErrorMessage = "Unauthorized";

/**
 * Whether the returned `policyDocument` is worth handing to IAM at all.
 *
 * Only its outer shape is checked here. What is inside it is IAM's business,
 * and a document IAM cannot read is a response API Gateway could not have used
 * either, so both end up as the same 500.
 */
function isPolicyDocument(value: unknown): value is SimIamPolicyDocument {
  return isRecord(value);
}

interface SimHttpApiAuthorizerResponseProperties {
  readonly authorizer: SimHttpApiRequestAuthorizer;
  /** The route ARN a policy response is evaluated against. */
  readonly routeArn: string;
}

/**
 * Reads what a Lambda `REQUEST` authorizer answered.
 *
 * There are two shapes, and `EnableSimpleResponses` says which one applies:
 * `{ isAuthorized, context }`, or a `principalId` with an IAM `policyDocument`
 * that has to allow `execute-api:Invoke` on the route. A response that is not
 * the shape its authorizer was configured for is a 500 rather than a refusal,
 * because API Gateway could not read it either.
 *
 * `{ "errorMessage": "Unauthorized" }` is the one answer that produces a 401,
 * and it is read whichever shape the authorizer is configured for. A function
 * that throws is an invocation failure here rather than that value: real
 * Lambda turns a thrown error into a payload carrying this member, while
 * simulated Lambda rejects with the error itself, so returning the value is
 * the way to ask for a 401.
 */
export class SimHttpApiAuthorizerResponse {
  private readonly authorizer: SimHttpApiRequestAuthorizer;
  private readonly routeArn: string;

  constructor(properties: SimHttpApiAuthorizerResponseProperties) {
    this.authorizer = properties.authorizer;
    this.routeArn = properties.routeArn;
  }

  /**
   * What the endpoint should do with the request, given what the authorizer
   * answered.
   */
  read(result: unknown): SimHttpApiAuthorization {
    if (!isRecord(result)) {
      return SimHttpApiRefused.error();
    }

    if (result["errorMessage"] === unauthorizedErrorMessage) {
      return SimHttpApiRefused.unauthorized();
    }

    if (this.authorizer.enableSimpleResponses) {
      return this.simpleResponse(result);
    }

    return this.policyResponse(result);
  }

  /**
   * Read a simple response, which says yes or no and nothing else.
   */
  private simpleResponse(
    result: Record<string, unknown>,
  ): SimHttpApiAuthorization {
    const isAuthorized = result["isAuthorized"];

    if (typeof isAuthorized !== "boolean") {
      return SimHttpApiRefused.error();
    }

    if (!isAuthorized) {
      return SimHttpApiRefused.forbidden();
    }

    return this.admitted(result);
  }

  /**
   * Read a policy response, and put the document it carries to IAM.
   */
  private policyResponse(
    result: Record<string, unknown>,
  ): SimHttpApiAuthorization {
    const policyDocument = result["policyDocument"];

    if (
      typeof result["principalId"] !== "string" ||
      !isPolicyDocument(policyDocument)
    ) {
      return SimHttpApiRefused.error();
    }

    try {
      return this.evaluated(policyDocument, result);
    } catch {
      // IAM refused to read the document, which is a malformed policy rather
      // than a policy that says no.
      return SimHttpApiRefused.error();
    }
  }

  private evaluated(
    policyDocument: SimIamPolicyDocument,
    result: Record<string, unknown>,
  ): SimHttpApiAuthorization {
    const allowed = new SimHttpApiAuthorizerPolicy(policyDocument).allows(
      this.routeArn,
    );

    if (!allowed) {
      return SimHttpApiRefused.forbidden();
    }

    return this.admitted(result);
  }

  /**
   * The admitted request, carrying whatever the authorizer passed on.
   *
   * A context that is not an object is left out rather than passed on as it
   * stands, since `requestContext.authorizer.lambda` is a JSON object on AWS
   * and a handler reading a member off it would find something else here.
   */
  private admitted(result: Record<string, unknown>): SimHttpApiAdmitted {
    const context = result["context"];

    if (!isRecord(context)) {
      return new SimHttpApiAdmitted({ lambda: null });
    }

    return new SimHttpApiAdmitted({
      lambda: context as SimPayload2LambdaAuthorizer,
    });
  }
}
