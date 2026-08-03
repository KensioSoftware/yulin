import { simHttpApiOpenApiRoot } from "./sim-http-api-openapi-body.js";
import type { SimHttpApiOpenApiObject } from "./sim-http-api-openapi-object.js";
import { SimHttpApiOpenApiPaths } from "./sim-http-api-openapi-paths.js";
import { SimHttpApiOpenApiValue } from "./sim-http-api-openapi-value.js";

/**
 * The OpenAPI versions an HTTP API is imported from.
 *
 * 3.1 is a separate specification rather than a later revision of 3.0, and
 * Swagger 2 predates both, so each is refused by version rather than read as
 * far as it happens to agree.
 */
const simulatedVersion = /^3\.0\.\d+$/;

/**
 * The root members that change what the API serves and are not simulated.
 *
 * A document-level `security` and `x-amazon-apigateway-any-method` are neither
 * established for HTTP APIs by the research behind this, so both are refused
 * rather than guessed at.
 */
const refusedRootMembers: readonly (readonly [string, string])[] = [
  [
    "servers",
    "a server URL sets the base path every route is served under, and base " +
      "path handling is not simulated",
  ],
  [
    "security",
    "a security requirement applying to every operation is not simulated. " +
      "Declare the requirement on each operation instead.",
  ],
  ["x-amazon-apigateway-cors", "CORS request handling is not simulated"],
];

/**
 * The OpenAPI 3.0 document an HTTP API is imported from.
 *
 * This is the root of the document and the version check on it. Everything
 * below is read by a class named after the member it reads, because the
 * refusal surface is most of the work and one reader would not stay readable.
 */
export class SimHttpApiOpenApiDocument {
  private readonly root: SimHttpApiOpenApiObject;

  constructor(root: SimHttpApiOpenApiObject) {
    this.root = root;

    this.requireSimulatedVersion();
    this.refuseUnsimulatedMembers();
  }

  /**
   * Read a serialised OpenAPI document.
   */
  static parse(body: string): SimHttpApiOpenApiDocument {
    return new SimHttpApiOpenApiDocument(simHttpApiOpenApiRoot(body));
  }

  /**
   * The name the imported API takes, which is the document's own title.
   */
  title(): string {
    return this.root.member("info").object().member("title").requiredString();
  }

  /**
   * The paths this document declares, one route per operation under each.
   */
  paths(): SimHttpApiOpenApiPaths {
    return new SimHttpApiOpenApiPaths(this.root.member("paths"));
  }

  /**
   * The security schemes an operation's security requirement can name.
   */
  securitySchemes(): SimHttpApiOpenApiValue {
    return this.component("securitySchemes");
  }

  /**
   * The reusable integration definitions an operation can `$ref`.
   */
  integrationDefinitions(): SimHttpApiOpenApiValue {
    return this.component("x-amazon-apigateway-integrations");
  }

  /**
   * One member of `components`, whether or not the document has any.
   */
  private component(name: string): SimHttpApiOpenApiValue {
    const components = this.root.member("components").optionalObject();

    if (components === undefined) {
      return new SimHttpApiOpenApiValue({
        pointer: this.root.pointer.child("components").child(name),
        value: undefined,
      });
    }

    return components.member(name);
  }

  /**
   * Refuse a document this simulation would read as something it is not.
   */
  private requireSimulatedVersion(): void {
    this.root.refuseMember(
      "swagger",
      "a Swagger 2 document is not simulated. Only OpenAPI 3.0.x is read.",
    );

    const declared = this.root.member("openapi");
    const version = declared.requiredString();

    if (!simulatedVersion.test(version)) {
      throw declared.refusal(
        `is '${version}', and only OpenAPI 3.0.x is simulated`,
      );
    }
  }

  /**
   * Refuse the root members that would otherwise be dropped.
   */
  private refuseUnsimulatedMembers(): void {
    for (const [name, reason] of refusedRootMembers) {
      this.root.refuseMember(name, reason);
    }
  }
}
