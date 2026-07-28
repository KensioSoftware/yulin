import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { SimSsmValidationException } from "../error/sim-ssm.error.js";
import type { SimSsmParameter } from "./sim-ssm-parameter.js";
import { ssmParameterArnPrefix } from "./sim-ssm-parameter-arn.js";

interface SimSsmParameterPathProperties {
  readonly path: string | undefined;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * A level of the parameter hierarchy, as GetParametersByPath names one.
 *
 * The path is also the resource GetParametersByPath authorizes against, which
 * is the part worth modelling: real Parameter Store grants access to a whole
 * subtree through its path, so a caller allowed `/myapp` can read `/myapp/prod`
 * recursively even where an explicit deny names the parameter itself.
 */
export class SimSsmParameterPath {
  /**
   * The path as the request wrote it.
   */
  public readonly value: string;

  /**
   * The ARN of the path, which is what an IAM policy names.
   */
  public readonly arn: string;

  private readonly prefix: string;

  constructor(properties: SimSsmParameterPathProperties) {
    this.value = SimSsmParameterPath.validated(properties.path);

    // A trailing slash is optional in the request and never part of the ARN.
    const resource = this.value.replace(/^\//, "").replace(/\/$/, "");

    this.arn = ssmParameterArnPrefix(properties.accountRegionScope) + resource;
    this.prefix = resource === "" ? "" : `${resource}/`;
  }

  private static validated(path: string | undefined): string {
    if (path === undefined || path.trim() === "") {
      throw new SimSsmValidationException(
        "A Path is required for GetParametersByPath",
      );
    }

    const trimmed = path.trim();

    if (!trimmed.startsWith("/")) {
      throw new SimSsmValidationException(
        `Path '${trimmed}' does not start with a forward slash: a parameter ` +
          `hierarchy starts at '/'`,
      );
    }

    return trimmed;
  }

  /**
   * Whether a parameter lies under this path.
   *
   * Without `recursive` only the level immediately below the path counts, so
   * `/myapp/db-host` is under `/myapp` and `/myapp/prod/db-host` is not.
   */
  contains(parameter: SimSsmParameter, recursive: boolean): boolean {
    const { resource } = parameter.arn;

    if (!resource.startsWith(this.prefix)) {
      return false;
    }

    if (recursive) {
      return true;
    }

    return !resource.slice(this.prefix.length).includes("/");
  }
}
