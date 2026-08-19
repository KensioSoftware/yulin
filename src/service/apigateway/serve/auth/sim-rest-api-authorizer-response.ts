import type { SimPayload1LambdaAuthorizer } from "../../../../serve/payload-1/sim-payload-1-event.type.js";
import { isRecord } from "../../../../util/type-guard/record.js";
import type { SimIamPolicyDocument } from "../../../iam/policy/sim-iam-policy.js";
import {
  SimRestApiAdmitted,
  type SimRestApiAuthorization,
  SimRestApiRefused,
} from "../../api/authorizer/sim-rest-api-authorization.js";
import { SimRestApiAuthorizerPolicy } from "./sim-rest-api-authorizer-policy.js";

/**
 * The one message a Lambda authorizer answers a 401 with.
 */
const unauthorizedErrorMessage = "Unauthorized";

/**
 * Reads what a REST API Lambda authorizer answered.
 *
 * There is one shape: a `principalId` naming the caller and an IAM
 * `policyDocument` that has to allow `execute-api:Invoke` on the method ARN. A
 * REST API authorizer always answers a policy, where an HTTP API authorizer
 * may answer a boolean. A response of any other shape is a 500 rather than a
 * refusal, because API Gateway could not read it either.
 *
 * `{ "errorMessage": "Unauthorized" }` is the one answer that produces a 401.
 * A function that throws is an invocation failure here rather than that value.
 * Real Lambda turns a thrown error into a payload carrying this member, while
 * simulated Lambda rejects with the error itself, so returning the value is
 * the way to ask for a 401.
 */
export class SimRestApiAuthorizerResponse {
  private readonly methodArn: string;

  constructor(methodArn: string) {
    this.methodArn = methodArn;
  }

  /**
   * What the endpoint should do with the request, given what the authorizer
   * answered.
   */
  read(result: unknown): SimRestApiAuthorization {
    if (!isRecord(result)) {
      return SimRestApiRefused.error();
    }

    if (result["errorMessage"] === unauthorizedErrorMessage) {
      return SimRestApiRefused.unauthorized();
    }

    const policyDocument = result["policyDocument"];

    if (
      typeof result["principalId"] !== "string" ||
      !isRecord(policyDocument)
    ) {
      return SimRestApiRefused.error();
    }

    return this.evaluated(policyDocument, result);
  }

  /**
   * Put the returned document to IAM, and gather what reaches the handler
   * where it allows the request.
   */
  private evaluated(
    policyDocument: SimIamPolicyDocument,
    result: Record<string, unknown>,
  ): SimRestApiAuthorization {
    try {
      return (
        new SimRestApiAuthorizerPolicy(policyDocument).refusal(
          this.methodArn,
        ) ?? new SimRestApiAdmitted({ lambda: this.authorizerContext(result) })
      );
    } catch {
      // IAM refused to read the document, which is a malformed policy rather
      // than a policy that says no.
      return SimRestApiRefused.error();
    }
  }

  /**
   * The `requestContext.authorizer` block for an admitted request.
   *
   * A REST API flattens the authorizer's `context` alongside its
   * `principalId`, so a handler reads `requestContext.authorizer.tenantId`
   * where payload format 2.0 would put the context in a block of its own. A
   * context that is not an object is left out, since a handler reading a
   * member off it would find something else here.
   */
  private authorizerContext(
    result: Record<string, unknown>,
  ): SimPayload1LambdaAuthorizer {
    const context = result["context"];
    const principalId = { principalId: result["principalId"] as string };

    return isRecord(context) ? { ...context, ...principalId } : principalId;
  }
}
