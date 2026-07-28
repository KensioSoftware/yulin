import {
  SimSsmParameterNotFound,
  SimSsmValidationException,
} from "../error/sim-ssm.error.js";
import type { SimSsmParameter } from "./sim-ssm-parameter.js";
import type { SimSsmParameterVersion } from "./sim-ssm-parameter-version.js";

const versionNumberPattern = /^\d+$/;

/**
 * A parameter name as a request writes it, with an optional version or label
 * selector after a colon.
 *
 * A parameter name cannot contain a colon, so the first one separates the name
 * from the selector. `name:3` names a version and `name:release` names a
 * label, which is how real Parameter Store tells the two apart: a label may
 * not start with a digit.
 */
export class SimSsmParameterSelector {
  /**
   * The parameter name, without the selector.
   */
  public readonly name: string;

  /**
   * The selector as Parameter Store reports it back, such as `:3`.
   */
  public readonly selector: string | undefined;

  private readonly version: number | undefined;
  private readonly label: string | undefined;

  constructor(requestedName: string) {
    const colonIndex = requestedName.indexOf(":");

    if (colonIndex === -1) {
      this.name = requestedName;
      return;
    }

    const selected = requestedName.slice(colonIndex + 1);

    if (selected === "") {
      throw new SimSsmValidationException(
        `Parameter name '${requestedName}' ends in a colon with no version ` +
          `or label after it`,
      );
    }

    this.name = requestedName.slice(0, colonIndex);
    this.selector = `:${selected}`;

    if (versionNumberPattern.test(selected)) {
      this.version = Number(selected);
    } else {
      this.label = selected;
    }
  }

  /**
   * The version of a parameter this selector names.
   *
   * Parameter labels are refused rather than looked up. Nothing in this
   * simulation can create one, because LabelParameterVersion is not
   * implemented, so a label selector could only ever fail. Saying why beats
   * reporting the parameter as missing.
   */
  versionOf(parameter: SimSsmParameter): SimSsmParameterVersion {
    if (this.label !== undefined) {
      throw new SimSsmParameterNotFound(
        `Parameter '${this.name}' has no label '${this.label}': parameter ` +
          `labels are not simulated, because LabelParameterVersion is not ` +
          `implemented. Select a version number instead.`,
      );
    }

    if (this.version === undefined) {
      return parameter.currentVersion;
    }

    return parameter.versionNumbered(this.version);
  }
}
