import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import {
  SimSsmHierarchyLevelLimitExceededException,
  SimSsmParameterPatternMismatchException,
  SimSsmValidationException,
} from "../error/sim-ssm.error.js";
import { ssmParameterArnPrefix } from "./sim-ssm-parameter-arn.js";

const allowedCharacters = /^[\w./-]+$/;
const maxHierarchyLevels = 15;
const reservedPrefixes = ["aws", "ssm"];

/**
 * The longest a parameter name may be, counting the ARN that precedes it.
 *
 * Real Parameter Store reserves the rest of the 2048 character ARN for its own
 * use, and counts the ARN prefix towards the 1011 characters left. That is why
 * this limit needs the Account and Region: the same name is legal in one
 * Region and too long in another.
 */
const maxArnLength = 1011;

interface SimSsmParameterNameProperties {
  readonly name: string | undefined;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * The name of one simulated parameter, validated as real Parameter Store
 * validates it.
 *
 * The rules are worth applying in one place because they are a common
 * deploy-time failure rather than an obscure edge: a hierarchy missing its
 * leading slash, a name under the reserved `/aws` prefix, or a hierarchy
 * sixteen levels deep all fail at PutParameter on real AWS.
 */
export class SimSsmParameterName {
  /**
   * The name as Parameter Store stores and reports it, leading slash and all.
   */
  public readonly value: string;

  /**
   * The name with any leading slash dropped, which is how it appears in the
   * parameter's ARN and how this simulation keys it.
   */
  public readonly resource: string;

  constructor(properties: SimSsmParameterNameProperties) {
    const name = SimSsmParameterName.trimmed(properties.name);

    this.value = name;
    this.resource = SimSsmParameterName.resourceFor(name);

    this.requireAllowedCharacters(name);
    this.requireWellFormedHierarchy(name);
    this.requireUnreservedPrefix();
    this.requireWithinArnLength(properties.accountRegionScope);
  }

  /**
   * Normalize a name to the resource part of its ARN.
   *
   * A parameter put as `db-host` and one read as `/db-host` are the same
   * parameter, because both name the same ARN. Keying on this form is what
   * makes the two interchangeable.
   */
  static resourceFor(name: string): string {
    return name.trim().replace(/^\//, "");
  }

  private static trimmed(name: string | undefined): string {
    if (name === undefined || name.trim() === "") {
      throw new SimSsmValidationException(
        "A parameter name is required and cannot be empty",
      );
    }

    // Real Parameter Store strips surrounding spaces and refuses inner ones.
    const trimmed = name.trim();

    if (trimmed.includes(" ")) {
      throw new SimSsmValidationException(
        `Parameter name '${trimmed}' contains spaces, which Parameter Store ` +
          `does not allow between characters`,
      );
    }

    return trimmed;
  }

  private requireAllowedCharacters(name: string): void {
    if (allowedCharacters.test(name)) {
      return;
    }

    throw new SimSsmParameterPatternMismatchException(
      `Parameter name '${name}' contains characters Parameter Store does not ` +
        `allow: only letters, digits, the characters _.- and the / hierarchy ` +
        `separator are permitted`,
    );
  }

  /**
   * Refuse a hierarchy that Parameter Store would refuse.
   *
   * The leading slash is the one people actually get wrong: a name written as
   * `myapp/prod/db-host` looks fine and is rejected on real AWS, because a
   * name containing a hierarchy has to be fully qualified.
   */
  private requireWellFormedHierarchy(name: string): void {
    if (!name.includes("/")) {
      return;
    }

    if (!name.startsWith("/")) {
      throw new SimSsmParameterPatternMismatchException(
        `Parameter name '${name}' is hierarchical, so it must start with a ` +
          `forward slash: '/${name}'`,
      );
    }

    const levels = this.resource.split("/");

    if (levels.includes("")) {
      throw new SimSsmParameterPatternMismatchException(
        `Parameter name '${name}' has an empty hierarchy level`,
      );
    }

    if (levels.length > maxHierarchyLevels) {
      throw new SimSsmHierarchyLevelLimitExceededException(
        `Parameter name '${name}' has ${String(levels.length)} hierarchy ` +
          `levels; a hierarchy can have a maximum of ` +
          `${String(maxHierarchyLevels)} levels`,
      );
    }
  }

  private requireUnreservedPrefix(): void {
    const lowerCased = this.resource.toLowerCase();
    const reserved = reservedPrefixes.find((prefix) =>
      lowerCased.startsWith(prefix),
    );

    if (reserved === undefined) {
      return;
    }

    throw new SimSsmParameterPatternMismatchException(
      `Parameter name '${this.value}' starts with '${reserved}', which ` +
        `Parameter Store reserves for its own parameters`,
    );
  }

  private requireWithinArnLength(
    accountRegionScope: SimAwsAccountRegionScope,
  ): void {
    const arnLength =
      ssmParameterArnPrefix(accountRegionScope).length + this.resource.length;

    if (arnLength <= maxArnLength) {
      return;
    }

    throw new SimSsmValidationException(
      `Parameter name '${this.value}' makes an ARN of ${String(arnLength)} ` +
        `characters; Parameter Store allows ${String(maxArnLength)} ` +
        `including the ARN prefix for this Account and Region`,
    );
  }
}
