import { SimCloudFormationValidationError } from "../error/sim-cloudformation.error.js";
import type { SimCfnTemplateValue } from "../template/value/sim-cfn-template-value.js";

/** One value a Stack publishes under an export name. */
export interface SimCfnExport {
  readonly name: string;
  readonly value: SimCfnTemplateValue;
}

interface SimCfnPublishedExport extends SimCfnExport {
  readonly stackName: string;
}

/**
 * The export names published by the Stacks in one Account and Region.
 *
 * CloudFormation scopes exports per Account and Region, and so does this. One
 * of these belongs to a SimCloudFormation, which covers one Account and one
 * Region. A Stack therefore reads the exports of the Stacks deployed alongside
 * it and of no others.
 *
 * A Stack publishes here once its Outputs have resolved, which happens after
 * its Resources have been created. An `Fn::ImportValue` therefore reads a
 * producer that has already finished deploying.
 */
export class SimCfnExports {
  private readonly published = new Map<string, SimCfnPublishedExport>();

  /**
   * The value published under an export name.
   *
   * A name no Stack has published is refused with the message CloudFormation
   * refuses an import with.
   */
  value(name: string): SimCfnTemplateValue {
    const published = this.published.get(name);

    if (published === undefined) {
      throw new SimCloudFormationValidationError(
        `No export named ${name} found`,
      );
    }

    return published.value;
  }

  /** The Stack that published an export name, if any Stack has. */
  publisher(name: string): string | undefined {
    return this.published.get(name)?.stackName;
  }

  /**
   * Publish everything one Stack exports, replacing what it published before.
   *
   * An export name another Stack already holds is refused. CloudFormation
   * reports that as a deployment failure. It arrives here the same way, since
   * this runs inside the deployment and what it throws becomes the Stack's
   * error.
   */
  publish(stackName: string, exports: readonly SimCfnExport[]): void {
    this.assertUnclaimed(stackName, exports);
    this.release(stackName);

    for (const exported of exports) {
      this.published.set(exported.name, { ...exported, stackName });
    }
  }

  /** Drop everything a Stack published, once the Stack itself has gone. */
  release(stackName: string): void {
    for (const [name, published] of this.published) {
      if (published.stackName === stackName) {
        this.published.delete(name);
      }
    }
  }

  private assertUnclaimed(
    stackName: string,
    exports: readonly SimCfnExport[],
  ): void {
    for (const exported of exports) {
      const publisher = this.publisher(exported.name);

      if (publisher !== undefined && publisher !== stackName) {
        throw new SimCloudFormationValidationError(
          `Export with name ${exported.name} is already exported by stack ${publisher}`,
        );
      }
    }
  }
}
