import type { SimRestApiAuthorizerView } from "../api/authorizer/sim-rest-api-authorizer.js";
import type { SimRestApiAuthorizerCommands } from "../command/authorizer/sim-rest-api-authorizer-commands.js";
import type { SimPutMethodCommandInput } from "../command/method/method.command.js";
import { simRestApiCognitoAuthorizationType } from "../command/method/sim-rest-api-method-authorizer-input.js";
import type { SimRestApiOpenApiCommand } from "./sim-rest-api-openapi-command.js";
import type {
  SimRestApiOpenApiOperation,
  SimRestApiOpenApiSecurityRequirement,
} from "./sim-rest-api-openapi-operation.js";
import type { SimRestApiOpenApiSecuritySchemes } from "./sim-rest-api-openapi-security-schemes.js";

/**
 * The authorization a method created from a document is declared with.
 */
export type SimRestApiOpenApiMethodAuthorization = Pick<
  SimPutMethodCommandInput,
  "authorizationType" | "authorizerId" | "authorizationScopes"
>;

const declaredTwice =
  "names a security scheme, and the operation also carries " +
  "x-amazon-apigateway-auth, so it says twice who may call the method. A " +
  "method is decided one way.";

interface SimRestApiOpenApiAuthorizationProperties {
  readonly authorizerCommands: SimRestApiAuthorizerCommands;
  readonly command: SimRestApiOpenApiCommand;
}

/**
 * Turns what an operation says about who may call it into the authorization
 * its method is declared with, creating the authorizer a security requirement
 * names.
 *
 * An operation saying nothing is open, which is what an imported method with
 * no authorizer is on AWS.
 */
export class SimRestApiOpenApiAuthorization {
  private readonly authorizerCommands: SimRestApiAuthorizerCommands;
  private readonly command: SimRestApiOpenApiCommand;

  constructor(properties: SimRestApiOpenApiAuthorizationProperties) {
    this.authorizerCommands = properties.authorizerCommands;
    this.command = properties.command;
  }

  /**
   * How the method one operation becomes says who may call it.
   */
  of(
    restApiId: string,
    operation: SimRestApiOpenApiOperation,
    schemes: SimRestApiOpenApiSecuritySchemes,
  ): SimRestApiOpenApiMethodAuthorization {
    const iam = operation.iamAuthorization();
    const requirement = operation.security();

    if (requirement === undefined) {
      return { authorizationType: iam ? "AWS_IAM" : "NONE" };
    }

    if (iam) {
      throw requirement.value.refusal(declaredTwice);
    }

    const authorizer = this.authorizerFor(restApiId, requirement, schemes);

    return authorizer === undefined
      ? {
          authorizationType: "AWS_IAM",
          authorizationScopes: scopesOf(requirement),
        }
      : this.gated(authorizer, requirement);
  }

  /**
   * The authorizer the scheme a requirement names declares, shared with every
   * method that named it before, and nothing at all where the scheme declares
   * a method decided by IAM.
   */
  private authorizerFor(
    restApiId: string,
    requirement: SimRestApiOpenApiSecurityRequirement,
    schemes: SimRestApiOpenApiSecuritySchemes,
  ): SimRestApiAuthorizerView | undefined {
    const shared = schemes.createdAuthorizer(requirement.schemeName);

    if (shared !== undefined) {
      return shared;
    }

    const { input, pointer } = schemes.authorizer(restApiId, requirement);

    if (input === undefined) {
      return undefined;
    }

    const created = this.command.run(pointer, () =>
      this.authorizerCommands.createAuthorizer({ input }),
    );
    schemes.remember(requirement.schemeName, created);

    return created;
  }

  /**
   * A method that sends its requests through one of the API's authorizers, of
   * the type that authorizer is.
   *
   * The requirement's scopes go with it rather than being dropped: AWS checks
   * scopes against the token a `COGNITO_USER_POOLS` method verifies, so
   * `PutMethod` refuses them on a method that checks none.
   */
  private gated(
    authorizer: SimRestApiAuthorizerView,
    requirement: SimRestApiOpenApiSecurityRequirement,
  ): SimRestApiOpenApiMethodAuthorization {
    return {
      authorizationType:
        authorizer.type === simRestApiCognitoAuthorizationType
          ? simRestApiCognitoAuthorizationType
          : "CUSTOM",
      authorizerId: authorizer.id,
      authorizationScopes: scopesOf(requirement),
    };
  }
}

/**
 * The scopes a requirement asks for, left out where it asks for none.
 *
 * An empty list is what most requirements carry, and `PutMethod` refuses
 * scopes on every method but the one kind that checks them, so an empty list
 * would refuse a method the document never asked to gate by scope.
 */
function scopesOf(
  requirement: SimRestApiOpenApiSecurityRequirement,
): readonly string[] | undefined {
  return requirement.scopes.length === 0 ? undefined : requirement.scopes;
}
