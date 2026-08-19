import { SimApiGatewayBadRequest } from "../../error/sim-api-gateway.error.js";
import { SimRestApiOpenApiDocument } from "../../openapi/sim-rest-api-openapi-document.js";
import { SimApiGatewayUnsimulatedInput } from "../sim-api-gateway-unsimulated-input.js";
import type {
  SimImportRestApiCommandInput,
  SimPutRestApiCommandInput,
  SimRestApiDefinitionBody,
} from "./rest-api.command.js";

const acceptedImportOptions = ["body", "failOnWarnings"];

const acceptedPutOptions = ["restApiId", "mode", "body", "failOnWarnings"];

/**
 * The one update mode simulated, which replaces the API's whole definition.
 */
const simulatedMode = "overwrite";

/**
 * Reads the inputs the two importing commands take, refusing the rest by name.
 *
 * `parameters` is outside both accepted sets. It carries the endpoint type,
 * the base path handling and whether documentation parts are imported, and
 * none of the three is simulated.
 */
export class SimRestApiImportInput {
  /**
   * The document `ImportRestApi` declares a new API with.
   *
   * It is parsed before anything else looks at the request, so a document this
   * simulation cannot read creates no API at all.
   */
  importDocument(
    input: SimImportRestApiCommandInput,
  ): SimRestApiOpenApiDocument {
    const unsimulated = new SimApiGatewayUnsimulatedInput("ImportRestApi");
    unsimulated.refuseUnaccepted(input, acceptedImportOptions);
    this.requireStrictWarnings("ImportRestApi", input.failOnWarnings);

    return this.document(unsimulated, input.body);
  }

  /**
   * The document `PutRestApi` replaces an API's definition with.
   */
  putDocument(input: SimPutRestApiCommandInput): SimRestApiOpenApiDocument {
    const unsimulated = new SimApiGatewayUnsimulatedInput("PutRestApi");
    unsimulated.refuseUnaccepted(input, acceptedPutOptions);
    this.requireStrictWarnings("PutRestApi", input.failOnWarnings);
    this.requireOverwriteMode(input.mode);

    return this.document(unsimulated, input.body);
  }

  /**
   * Read the request body, which the SDK sends as bytes.
   *
   * A stream is refused rather than read, because a document has to be parsed
   * before the request is answered and reading a stream is asynchronous.
   */
  private document(
    unsimulated: SimApiGatewayUnsimulatedInput,
    body: SimRestApiDefinitionBody | undefined,
  ): SimRestApiOpenApiDocument {
    return SimRestApiOpenApiDocument.parse(
      unsimulated.require("body", this.text(body)),
    );
  }

  /**
   * The document as text, whichever of the body types it arrived as.
   */
  private text(body: SimRestApiDefinitionBody | undefined): string | undefined {
    if (body === undefined || typeof body === "string") {
      return body;
    }

    if (body instanceof Uint8Array) {
      return Buffer.from(body).toString();
    }

    throw new SimApiGatewayBadRequest(
      "Only string and Uint8Array OpenAPI documents are read: a stream or a " +
        "Blob would have to be read before the request could be answered",
    );
  }

  /**
   * Refuse the lenient half of `failOnWarnings`.
   *
   * Everything this simulation cannot apply is refused rather than warned
   * about, which is what `true` asks for, so the behaviour `false` selects is
   * refused rather than quietly ignored. AWS takes `false` as the default, so
   * this is refused where it is written rather than where it is left out.
   */
  private requireStrictWarnings(
    operation: string,
    failOnWarnings: boolean | undefined,
  ): void {
    if (failOnWarnings !== false) {
      return;
    }

    throw new SimApiGatewayBadRequest(
      `${operation} failOnWarnings false is not simulated: an import ` +
        `carrying on past a warning would create an API here that AWS ` +
        `created differently`,
    );
  }

  /**
   * Refuse an update mode that is not a whole replacement.
   *
   * AWS takes `merge` as the default, and a merge adds the document's paths to
   * the API's existing ones. Which of two declarations of one method it keeps
   * decides what every request to that method reaches, so the mode is required
   * here rather than defaulted to the one AWS would have merged.
   */
  private requireOverwriteMode(mode: string | undefined): void {
    if (mode === simulatedMode) {
      return;
    }

    throw new SimApiGatewayBadRequest(
      `PutRestApi mode '${mode ?? "merge"}' is not simulated: merging a ` +
        `document into an API's existing definition is not simulated, and ` +
        `merge is the mode AWS takes when none is given. Ask for ` +
        `'${simulatedMode}' to replace the API's definition.`,
    );
  }
}
