declare module "eslint-plugin-promise" {
  import type { ESLint } from "eslint";

  const plugin: ESLint.Plugin & {
    configs: {
      "flat/recommended": ESLint.Plugin;
    };
  };

  export default plugin;
}
