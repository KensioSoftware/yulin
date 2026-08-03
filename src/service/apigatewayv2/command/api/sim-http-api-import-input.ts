import { SimApiGatewayV2BadRequest } from "../../error/sim-api-gateway-v2.error.js";
import { SimHttpApiOpenApiDocument } from "../../openapi/sim-http-api-openapi-document.js";
import { SimApiGatewayV2UnsimulatedInput } from "../sim-api-gateway-v2-unsimulated-input.js";
import type { SimImportApiCommandInput } from "./api.command.js";

const acceptedImportApiOptions = ["Body", "FailOnWarnings"];

/**
 * Reads the one input `ImportApi` takes, refusing the rest by name.
 *
 * `Basepath` is outside the accepted set: a base path changes the path every
 * route of the API matches on, and base path handling is not simulated.
 */
export class SimHttpApiImportInput {
  private readonly input: SimImportApiCommandInput;

  constructor(input: SimImportApiCommandInput) {
    this.input = input;
  }

  /**
   * The document this import declares the API with.
   *
   * It is parsed before anything else looks at the request, so a document this
   * simulation cannot read creates no API at all.
   */
  document(): SimHttpApiOpenApiDocument {
    const unsimulated = new SimApiGatewayV2UnsimulatedInput("ImportApi");
    unsimulated.refuseUnaccepted(this.input, acceptedImportApiOptions);
    this.requireStrictWarnings();

    return SimHttpApiOpenApiDocument.parse(
      unsimulated.require("Body", this.input.Body),
    );
  }

  /**
   * Refuse the lenient half of `FailOnWarnings`.
   *
   * Everything this simulation cannot apply is refused rather than warned
   * about, which is what `true` asks for, so the behaviour `false` selects is
   * refused rather than quietly ignored.
   */
  private requireStrictWarnings(): void {
    if (this.input.FailOnWarnings !== false) {
      return;
    }

    throw new SimApiGatewayV2BadRequest(
      "ImportApi FailOnWarnings false is not simulated: an import carrying " +
        "on past a warning would create an API here that AWS created " +
        "differently",
    );
  }
}
