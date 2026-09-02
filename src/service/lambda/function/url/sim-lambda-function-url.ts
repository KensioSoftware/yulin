import { faker } from "@faker-js/faker";

import type { Brand } from "../../../../util/brand.type.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimLambdaFunctionName } from "../sim-lambda-function.js";
import type { SimLambdaFunctionUrlCors } from "./sim-lambda-function-url-cors.js";
import { simLambdaFunctionUrlHost } from "./sim-lambda-function-url-host.js";
import {
  type SimClock,
  SimRealClock,
} from "../../../../util/clock/sim-clock.js";

/**
 * The id AWS allocates for one Function URL, which is the leading DNS label of
 * the URL it hands out.
 */
export type SimLambdaFunctionUrlId = Brand<string, "SimLambdaFunctionUrlId">;

/**
 * Function URL authentication types.
 *
 * NONE makes the URL publicly invokable. AWS_IAM admits only a caller allowed
 * `lambda:InvokeFunctionUrl` on the function, resolved from a SigV4 signature
 * or from a named principal at the HTTP boundary.
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
  readonly cors?: SimLambdaFunctionUrlCors | undefined;
  /**
   * Clock stamping this Function URL's creation and last modified times. A
   * Function URL built standalone, outside a SimAws instance, falls back to the
   * real clock.
   */
  readonly clock?: SimClock | undefined;
}

/**
 * Minimal structural Function URL configuration, as returned by the
 * CreateFunctionUrlConfig, GetFunctionUrlConfig and UpdateFunctionUrlConfig
 * commands.
 *
 * A URL configured without CORS has no `Cors` member at all. An empty block
 * would still decide headers.
 */
export interface SimLambdaFunctionUrlConfiguration {
  FunctionUrl: string;
  FunctionArn: string;
  AuthType: SimLambdaFunctionUrlAuthType;
  InvokeMode: SimLambdaFunctionUrlInvokeMode;
  Cors?: SimLambdaFunctionUrlCors | undefined;
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
  #cors: SimLambdaFunctionUrlCors | undefined;
  #lastModifiedTime: string;
  private readonly clock: SimClock;

  constructor(properties: SimLambdaFunctionUrlProperties) {
    const {
      urlId,
      functionName,
      functionArn,
      accountRegionScope,
      authType = "NONE",
      invokeMode = "BUFFERED",
      cors,
      clock = new SimRealClock(),
    } = properties;

    this.clock = clock;

    this.urlId = urlId;
    this.functionName = functionName;
    this.functionArn = functionArn;
    this.accountRegionScope = accountRegionScope;
    this.#authType = authType;
    this.#invokeMode = invokeMode;
    this.#cors = cors;
    this.creationTime = clock.now().toISOString();
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
   * Get the CORS configuration for this Function URL. A URL without one sends
   * no CORS headers of its own.
   */
  get cors(): SimLambdaFunctionUrlCors | undefined {
    return this.#cors;
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
   *
   * A stated `Cors` replaces the whole block. An update naming only
   * `AllowOrigins` drops the methods and headers the URL was created with, the
   * way it does on AWS.
   */
  update(properties: {
    readonly authType?: SimLambdaFunctionUrlAuthType | undefined;
    readonly invokeMode?: SimLambdaFunctionUrlInvokeMode | undefined;
    readonly cors?: SimLambdaFunctionUrlCors | undefined;
  }): void {
    this.#authType = properties.authType ?? this.#authType;
    this.#invokeMode = properties.invokeMode ?? this.#invokeMode;
    this.#cors = properties.cors ?? this.#cors;
    this.#lastModifiedTime = this.clock.now().toISOString();
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
      ...(this.#cors !== undefined && { Cors: this.#cors }),
      CreationTime: this.creationTime,
      LastModifiedTime: this.#lastModifiedTime,
    };
  }
}

export type SimLambdaFunctionUrlMap = Map<
  SimLambdaFunctionName,
  SimLambdaFunctionUrl
>;
