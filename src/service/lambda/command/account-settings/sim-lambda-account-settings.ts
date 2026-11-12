import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimLambdaFunctionMap } from "../../function/sim-lambda-function.js";
import type { SimLambdaFunctionVersionStore } from "../../function/version/sim-lambda-function-version-store.js";
import { simLambdaUnreservedConcurrency } from "../concurrency/reserved-concurrency-limit.js";
import { ListFunctionsAuthorizer } from "../list-functions/list-functions-authorizer.js";
import type {
  SimGetAccountSettingsCommand,
  SimGetAccountSettingsCommandOutput,
} from "./get-account-settings.command.js";

interface SimLambdaAccountSettingsProperties {
  readonly functionMap: SimLambdaFunctionMap;
  readonly versions: SimLambdaFunctionVersionStore;
  readonly iam: SimIamInterServiceAuthZ;
  readonly background: BackgroundScheduler;
}

interface SimLambdaAccountSettingsOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The default storage real Lambda gives an Account in a Region for every
 * function and layer package it holds, which is 75 GB.
 */
const totalCodeSizeLimit = 80_530_636_800;

/**
 * The largest unzipped package real Lambda takes, 250 MB.
 */
const codeSizeUnzippedLimit = 262_144_000;

/**
 * The largest zip file real Lambda takes uploaded directly, 50 MB.
 */
const codeSizeZippedLimit = 52_428_800;

/**
 * Simulated Lambda GetAccountSettings, reporting the default quotas of one
 * Account and Region beside what its functions use of them.
 *
 * Usage counts the package of `$LATEST` and of every published version, since
 * each one is stored, and the unreserved concurrency is what the functions'
 * reservations leave of the Region's limit.
 */
export class SimLambdaAccountSettings {
  private readonly properties: SimLambdaAccountSettingsProperties;
  private readonly authorizer: ListFunctionsAuthorizer;

  constructor(properties: SimLambdaAccountSettingsProperties) {
    this.properties = properties;
    this.authorizer = new ListFunctionsAuthorizer({
      iam: properties.iam,
      action: "lambda:GetAccountSettings",
    });
  }

  /**
   * Report the Account's limits and usage.
   */
  async get(
    _command: SimGetAccountSettingsCommand,
    options?: SimLambdaAccountSettingsOptions,
  ): Promise<SimGetAccountSettingsCommandOutput> {
    // Allow for potential non-deterministic sequencing of async events.
    await this.properties.background.sequence();
    this.authorizer.authorize(options?.caller);

    const functions = this.properties.functionMap.values().toArray();
    const totalCodeSize = functions
      .flatMap((simFunction) => this.properties.versions.all(simFunction))
      .reduce((sum, version) => sum + version.codePackage.size, 0);
    const { limit, unreserved } = simLambdaUnreservedConcurrency(functions);

    return {
      $metadata: {},
      AccountLimit: {
        TotalCodeSize: totalCodeSizeLimit,
        CodeSizeUnzipped: codeSizeUnzippedLimit,
        CodeSizeZipped: codeSizeZippedLimit,
        ConcurrentExecutions: limit,
        UnreservedConcurrentExecutions: unreserved,
      },
      AccountUsage: {
        TotalCodeSize: totalCodeSize,
        FunctionCount: functions.length,
      },
    };
  }
}
