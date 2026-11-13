import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimLambdaFunctionTags } from "../../function/tags/sim-lambda-function-tags.js";
import { FunctionUrlAuthorizer } from "../function-url/function-url-authorizer.js";
import { simLambdaRequestTagConditions } from "../../function/tags/sim-lambda-request-tag-conditions.js";

interface CreateFunctionTagAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to the tags a CreateFunction request carries.
 *
 * AWS treats tagging on create as a TagResource, so a caller allowed to create
 * functions but not to tag them cannot create a tagged one. A request carrying
 * no tags asks nothing of TagResource.
 */
export class CreateFunctionTagAuthorizer {
  private readonly tagResource: FunctionUrlAuthorizer;

  constructor(properties: CreateFunctionTagAuthorizerProperties) {
    this.tagResource = new FunctionUrlAuthorizer({
      iam: properties.iam,
      action: "lambda:TagResource",
    });
  }

  /**
   * Ensure the caller may tag the function it is creating with these tags.
   */
  authorize(
    functionArn: string,
    tags: SimLambdaFunctionTags,
    caller?: SimAwsCaller,
  ): void {
    if (!tags.isEmpty) {
      this.tagResource.authorize(
        functionArn,
        caller,
        simLambdaRequestTagConditions(tags.record()),
      );
    }
  }
}
