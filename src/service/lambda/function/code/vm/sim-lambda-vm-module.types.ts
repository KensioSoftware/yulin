/**
 * One module in a sim Lambda vm module system, holding what it exported.
 */
export interface SimLambdaVmModule {
  exports: unknown;
}

/**
 * The function a compiled CommonJS module is, once its source has been wrapped
 * in the parameters Node.js gives every module.
 */
export type SimLambdaVmCommonJsModule = (
  exports: unknown,
  require: (specifier: string) => unknown,
  module: SimLambdaVmModule,
  filename: string,
  dirname: string,
) => void;
