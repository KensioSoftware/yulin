import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import { SimSsmParameterName } from "../../parameter/sim-ssm-parameter-name.js";
import type { SimSsmParameterWriter } from "../../parameter/sim-ssm-parameter-writer.js";
import type { SimSsmAuthorizer } from "../authorize/sim-ssm-authorizer.js";
import type {
  SimPutParameterCommand,
  SimPutParameterCommandOutput,
} from "./parameter.command.js";
import { standardTier } from "./sim-ssm-parameter-view.js";
import { SimSsmUnsimulatedPutOptions } from "./sim-ssm-unsimulated-put-options.js";

interface SimSsmPutParameterProperties {
  readonly writer: SimSsmParameterWriter;
  readonly authorizer: SimSsmAuthorizer;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

interface SimSsmPutParameterOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The PutParameter command.
 *
 * The name is validated before anything else happens, because the name is
 * what the request authorizes against: a policy allowing the caller to write
 * `/myapp/prod/*` has to be evaluated against the ARN the parameter is about
 * to have, whether or not it exists yet.
 */
export class SimSsmPutParameter {
  private readonly writer: SimSsmParameterWriter;
  private readonly authorizer: SimSsmAuthorizer;
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly unsimulatedOptions = new SimSsmUnsimulatedPutOptions();

  constructor(properties: SimSsmPutParameterProperties) {
    this.writer = properties.writer;
    this.authorizer = properties.authorizer;
    this.accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Create or update a parameter.
   */
  handle(
    command: SimPutParameterCommand,
    options?: SimSsmPutParameterOptions,
  ): SimPutParameterCommandOutput {
    const { input } = command;

    this.unsimulatedOptions.refuseIn(input);

    const name = new SimSsmParameterName({
      name: input.Name,
      accountRegionScope: this.accountRegionScope,
    });
    const caller = this.authorizer.authorizeParameterResource(
      "ssm:PutParameter",
      name.resource,
      options?.caller,
    );

    const version = this.writer.write({
      name,
      value: input.Value,
      type: input.Type,
      overwrite: input.Overwrite,
      description: input.Description,
      dataType: input.DataType,
      lastModifiedUser: caller.arn,
    });

    return {
      $metadata: {},
      Version: version.version,
      Tier: standardTier,
    };
  }
}
