import { faker } from "@faker-js/faker";

import type { Brand } from "../../../../util/brand.type.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimLambdaFunctionName } from "../sim-lambda-function.js";
import { simLambdaFunctionUrlHost } from "./sim-lambda-function-url-host.js";

/**
 * The id AWS allocates for one Function URL, which is the leading DNS label of
 * the URL it hands out.
 */
export type SimLambdaFunctionUrlId = Brand<string, "SimLambdaFunctionUrlId">;

/**
 * Function URL authentication types.
 *
 * NONE makes the URL publicly invokable. AWS_IAM requires SigV4-signed
 * requests, which the simulator stores and reports but does not authenticate.
 */
export type SimLambdaFunctionUrlAuthType = "NONE" | "AWS_IAM";

/**
 * Function URL invocation modes. Only BUFFERED responses are simulated.
 */
export type SimLambdaFunctionUrlInvokeMode = "BUFFERED" | "RESPONSE_STREAM";

/**
 * Allocate a Function URL id in the shape real Lambda uses: 32 lowercase
 * alphanumeric characters, forming one DNS label.
 */
export function makeSimLambdaFunctionUrlId(): SimLambdaFunctionUrlId {
  return faker.helpers.fromRegExp(/[a-z0-9]{32}/) as SimLambdaFunctionUrlId;
}

interface SimLambdaFunctionUrlProperties {
  readonly urlId: SimLambdaFunctionUrlId;
  readonly functionName: SimLambdaFunctionName;
  readonly functionArn: string;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly authType?: SimLambdaFunctionUrlAuthType | undefined;
  readonly invokeMode?: SimLambdaFunctionUrlInvokeMode | undefined;
}

/**
 * Minimal structural Function URL configuration, as returned by the
 * CreateFunctionUrlConfig, GetFunctionUrlConfig and UpdateFunctionUrlConfig
 * commands.
 */
export interface SimLambdaFunctionUrlConfiguration {
  FunctionUrl: string;
  FunctionArn: string;
  AuthType: SimLambdaFunctionUrlAuthType;
  InvokeMode: SimLambdaFunctionUrlInvokeMode;
  CreationTime: string;
  LastModifiedTime: string;
}

/**
 * Simulated Lambda Function URL resource.
 *
 * A Function URL is the HTTP endpoint for one function. The id is the routing
 * key: it is the leading label of the endpoint hostname, so the localhost
 * serving layer can find the function from nothing but the request Host.
 */
export class SimLambdaFunctionUrl {
  public readonly urlId: SimLambdaFunctionUrlId;
  public readonly functionName: SimLambdaFunctionName;
  public readonly functionArn: string;
  public readonly accountRegionScope: SimAwsAccountRegionScope;
  public readonly creationTime: string;

  #authType: SimLambdaFunctionUrlAuthType;
  #invokeMode: SimLambdaFunctionUrlInvokeMode;
  #lastModifiedTime: string;

  constructor(properties: SimLambdaFunctionUrlProperties) {
    const {
      urlId,
      functionName,
      functionArn,
      accountRegionScope,
      authType = "NONE",
      invokeMode = "BUFFERED",
    } = properties;

    this.urlId = urlId;
    this.functionName = functionName;
    this.functionArn = functionArn;
    this.accountRegionScope = accountRegionScope;
    this.#authType = authType;
    this.#invokeMode = invokeMode;
    this.creationTime = new Date().toISOString();
    this.#lastModifiedTime = this.creationTime;
  }

  /**
   * Get the authentication type for this Function URL.
   */
  get authType(): SimLambdaFunctionUrlAuthType {
    return this.#authType;
  }

  /**
   * Get the invocation mode for this Function URL.
   */
  get invokeMode(): SimLambdaFunctionUrlInvokeMode {
    return this.#invokeMode;
  }

  /**
   * Get the endpoint hostname for this Function URL.
   */
  get hostname(): string {
    return simLambdaFunctionUrlHost({
      urlId: this.urlId,
      regionName: this.accountRegionScope.regionName,
    });
  }

  /**
   * Get the endpoint URL for this Function URL, with the trailing slash real
   * Lambda includes.
   */
  get url(): string {
    return `https://${this.hostname}/`;
  }

  /**
   * Apply an update to this Function URL's configuration.
   *
   * Omitted values are left as they are, as real UpdateFunctionUrlConfig does.
   */
  update(properties: {
    readonly authType?: SimLambdaFunctionUrlAuthType | undefined;
    readonly invokeMode?: SimLambdaFunctionUrlInvokeMode | undefined;
  }): void {
    this.#authType = properties.authType ?? this.#authType;
    this.#invokeMode = properties.invokeMode ?? this.#invokeMode;
    this.#lastModifiedTime = new Date().toISOString();
  }

  /**
   * Get the AWS-like configuration for this Function URL.
   */
  configuration(): SimLambdaFunctionUrlConfiguration {
    return {
      FunctionUrl: this.url,
      FunctionArn: this.functionArn,
      AuthType: this.#authType,
      InvokeMode: this.#invokeMode,
      CreationTime: this.creationTime,
      LastModifiedTime: this.#lastModifiedTime,
    };
  }
}

export type SimLambdaFunctionUrlMap = Map<
  SimLambdaFunctionName,
  SimLambdaFunctionUrl
>;
