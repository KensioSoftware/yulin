import {
  SimSsmParameterNotFound,
  SimSsmParameterVersionNotFound,
} from "../../error/sim-ssm.error.js";
import type { SimSsmParameterEncryption } from "../../parameter/sim-ssm-parameter-encryption.js";
import { SimSsmParameterName } from "../../parameter/sim-ssm-parameter-name.js";
import { SimSsmParameterSelector } from "../../parameter/sim-ssm-parameter-selector.js";
import type { SimSsmParameterStore } from "../../parameter/sim-ssm-parameter-store.js";
import type { SimSsmAuthorizer } from "../authorize/sim-ssm-authorizer.js";
import type {
  SimSsmFoundParameter,
  SimSsmParameterReadRequest,
} from "./sim-ssm-parameter-read.js";
import { SimSsmParameterView } from "./sim-ssm-parameter-view.js";

interface SimSsmParameterReaderProperties {
  readonly parameters: SimSsmParameterStore;
  readonly encryption: SimSsmParameterEncryption;
  readonly authorizer: SimSsmAuthorizer;
}

/**
 * Resolves one requested parameter name to the value a read reports.
 *
 * GetParameter and GetParameters differ only in what they do when a name
 * resolves to nothing, so everything before that point belongs here.
 */
export class SimSsmParameterReader {
  private readonly parameters: SimSsmParameterStore;
  private readonly encryption: SimSsmParameterEncryption;
  private readonly authorizer: SimSsmAuthorizer;
  private readonly view = new SimSsmParameterView();

  constructor(properties: SimSsmParameterReaderProperties) {
    this.parameters = properties.parameters;
    this.encryption = properties.encryption;
    this.authorizer = properties.authorizer;
  }

  /**
   * Read one requested name, authorizing it before resolving it.
   *
   * Authorization comes first because real IAM evaluates a request before the
   * service sees it: a caller with no permission is refused whether or not the
   * parameter exists, rather than being told it is missing. Decrypting a
   * SecureString authorizes again, this time `kms:Decrypt` against the key.
   */
  async read(
    request: SimSsmParameterReadRequest,
  ): Promise<SimSsmFoundParameter> {
    const selector = new SimSsmParameterSelector(request.requested);

    this.authorizer.authorizeParameterResource(
      request.action,
      SimSsmParameterName.resourceFor(selector.name),
      request.caller,
    );

    const parameter = this.parameters.require(selector.name);
    const version = selector.versionOf(parameter);
    const reportedValue = await this.encryption.reported(
      parameter,
      version,
      request.withDecryption,
      request.caller,
    );

    return {
      name: parameter.name.value,
      output: this.view.value(
        parameter,
        version,
        reportedValue,
        selector.selector,
      ),
    };
  }

  /**
   * Read one name of a batch, reporting a name that resolves to nothing as
   * invalid rather than failing the whole request.
   *
   * A refused authorization still throws, because one name the caller may not
   * read fails the whole batch on real AWS.
   */
  async readOrInvalid(
    request: SimSsmParameterReadRequest,
  ): Promise<SimSsmFoundParameter | undefined> {
    try {
      return await this.read(request);
    } catch (error: unknown) {
      if (
        error instanceof SimSsmParameterNotFound ||
        error instanceof SimSsmParameterVersionNotFound
      ) {
        return undefined;
      }

      throw error;
    }
  }
}
