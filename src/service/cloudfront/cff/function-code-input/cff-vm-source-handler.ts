import vm from "node:vm";

import type { CloudFrontFunction } from "../../typings/cloudfront-functions.namespace.js";
import {
  type CffCloudFrontModule,
  cffCloudFrontModule,
} from "../kvs/cff-cloudfront-module.js";
import { cffSourceWithoutCloudFrontImport } from "./cff-cloudfront-import.js";

/**
 * Compile CloudFront Function source and hand back its handler.
 *
 * The source runs in a vm context of its own, which is the closest thing here
 * to the isolate real CloudFront gives a Function. The context holds this
 * Function's own `cf`, so two Functions running in one process each read the
 * key value store they are associated with and nothing else. A Function with no
 * association still gets a `cf`, one that refuses when asked to open a store.
 */
export function cffHandlerFromSource(
  source: string,
  cloudFront: CffCloudFrontModule = cffCloudFrontModule(undefined),
): CloudFrontFunction.Handler {
  const context = vm.createContext({ console, cf: cloudFront });
  const script = new vm.Script(`
    ${cffSourceWithoutCloudFrontImport(source)}
    handler;
    `);

  const handler = script.runInContext(context, {
    timeout: 50, // Real CloudFront Functions have a short timeout.
    breakOnSigint: true,
  }) as CloudFrontFunction.Handler;

  if (typeof handler !== "function") {
    throw new TypeError(
      "CloudFront Function code did not define a handler function",
    );
  }

  return handler;
}
