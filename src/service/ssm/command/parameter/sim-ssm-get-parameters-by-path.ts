import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import { SimSsmValidationException } from "../../error/sim-ssm.error.js";
import type { SimSsmParameterEncryption } from "../../parameter/sim-ssm-parameter-encryption.js";
import { SimSsmParameterPath } from "../../parameter/sim-ssm-parameter-path.js";
import type { SimSsmParameter } from "../../parameter/sim-ssm-parameter.js";
import type { SimSsmParameterStore } from "../../parameter/sim-ssm-parameter-store.js";
import type { SimSsmAuthorizer } from "../authorize/sim-ssm-authorizer.js";
import type { SimSsmParameterOutput } from "./parameter.command.js";
import type {
  SimGetParametersByPathCommand,
  SimGetParametersByPathCommandInput,
  SimGetParametersByPathCommandOutput,
} from "./query.command.js";
import { SimSsmParameterPage } from "./sim-ssm-parameter-page.js";
import { SimSsmParameterView } from "./sim-ssm-parameter-view.js";

/**
 * The page size real Parameter Store uses for a path listing.
 */
const maxResults = 10;

interface SimSsmGetParametersByPathProperties {
  readonly parameters: SimSsmParameterStore;
  readonly encryption: SimSsmParameterEncryption;
  readonly authorizer: SimSsmAuthorizer;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

interface SimSsmGetParametersByPathOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The GetParametersByPath command.
 *
 * This authorizes against the path rather than against each parameter it
 * returns, as real Parameter Store does. Access to a path is access to
 * everything under it: a caller allowed `/myapp` can read `/myapp/prod/db-host`
 * recursively even where a policy explicitly denies that parameter.
 */
export class SimSsmGetParametersByPath {
  private readonly parameters: SimSsmParameterStore;
  private readonly encryption: SimSsmParameterEncryption;
  private readonly authorizer: SimSsmAuthorizer;
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly view = new SimSsmParameterView();

  constructor(properties: SimSsmGetParametersByPathProperties) {
    this.parameters = properties.parameters;
    this.encryption = properties.encryption;
    this.authorizer = properties.authorizer;
    this.accountRegionScope = properties.accountRegionScope;
  }

  /**
   * List the parameters under one level of the hierarchy.
   */
  async handle(
    command: SimGetParametersByPathCommand,
    options?: SimSsmGetParametersByPathOptions,
  ): Promise<SimGetParametersByPathCommandOutput> {
    const { input } = command;

    if (input.ParameterFilters !== undefined) {
      throw new SimSsmValidationException(
        "GetParametersByPath ParameterFilters are not simulated: applying " +
          "none of them would return more parameters than real Parameter " +
          "Store returns",
      );
    }

    const path = new SimSsmParameterPath({
      path: input.Path,
      accountRegionScope: this.accountRegionScope,
    });

    this.authorizer.authorizeArn(
      "ssm:GetParametersByPath",
      path.arn,
      options?.caller,
    );

    const page = new SimSsmParameterPage(
      this.parameters.under(path, input.Recursive === true),
      input,
      { operation: "GetParametersByPath", maxResults },
    );

    return {
      $metadata: {},
      Parameters: await Promise.all(
        page.items.map(
          async (parameter) => await this.listed(parameter, input, options),
        ),
      ),
      NextToken: page.nextToken,
    };
  }

  /**
   * One listed parameter, decrypted if the listing asked for it.
   */
  private async listed(
    parameter: SimSsmParameter,
    input: SimGetParametersByPathCommandInput,
    options: SimSsmGetParametersByPathOptions | undefined,
  ): Promise<SimSsmParameterOutput> {
    const version = parameter.currentVersion;
    const reportedValue = await this.encryption.reported(
      parameter,
      version,
      input.WithDecryption,
      options?.caller,
    );

    return this.view.value(parameter, version, reportedValue);
  }
}
