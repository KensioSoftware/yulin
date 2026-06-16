import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig({
  // ── CloudFront Functions JS2
  files: ["**/*.cff.js"],
  extends: [tseslint.configs.disableTypeChecked],
  languageOptions: {
    parserOptions: {
      projectService: false,
    },
  },
  rules: {
    "no-var": "off",
    "prefer-const": "off",
    "object-shorthand": "off",
    "prefer-template": "off",
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/explicit-module-boundary-types": "off",
    "no-eval": "error",
    "no-new-func": "error",
    "no-implied-eval": "error",
    "no-restricted-globals": [
      "error",
      {
        name: "fetch",
        message: "CloudFront Functions cannot make network requests.",
      },
      {
        name: "XMLHttpRequest",
        message: "CloudFront Functions cannot make network requests.",
      },
      {
        name: "WebSocket",
        message: "CloudFront Functions cannot open network connections.",
      },
      {
        name: "require",
        message:
          "CloudFront Functions must be self-contained and cannot require modules.",
      },
      {
        name: "process",
        message:
          "CloudFront Functions do not have access to Node.js process APIs.",
      },
      {
        name: "Buffer",
        message: "CloudFront Functions do not have access to Node.js Buffer.",
      },
      {
        name: "setTimeout",
        message: "CloudFront Functions do not support timers.",
      },
      {
        name: "setInterval",
        message: "CloudFront Functions do not support timers.",
      },
      {
        name: "setImmediate",
        message: "CloudFront Functions do not support timers.",
      },
      {
        name: "Promise",
        message: "Avoid Promise usage in CloudFront Functions.",
      },
    ],
    "no-restricted-syntax": [
      "error",
      {
        selector: "TemplateLiteral",
        message:
          "CloudFront Functions JS2 does not support template literals. Use string concatenation instead.",
      },
      {
        selector: "ImportDeclaration",
        message:
          "CloudFront Functions must be self-contained and should not use import syntax.",
      },
      {
        selector:
          "ExportNamedDeclaration:not([declaration.type='FunctionDeclaration'][declaration.id.name='handler'])",
        message:
          "CloudFront Function files may only export the handler as `export function handler(...)`.",
      },
      {
        selector: "ExportDefaultDeclaration, ExportAllDeclaration",
        message:
          "CloudFront Function files may only export the handler as `export function handler(...)`.",
      },
      {
        selector: "ClassDeclaration, ClassExpression",
        message: "Avoid class syntax in CloudFront Functions JS2 files.",
      },
      {
        selector: "ArrowFunctionExpression",
        message:
          "Avoid arrow functions in CloudFront Functions JS2 files. Use function declarations/expressions instead.",
      },
      {
        selector:
          "AwaitExpression, FunctionDeclaration[async=true], FunctionExpression[async=true], ArrowFunctionExpression[async=true]",
        message: "CloudFront Functions should not use async/await.",
      },
      {
        selector:
          "YieldExpression, FunctionDeclaration[generator=true], FunctionExpression[generator=true]",
        message: "CloudFront Functions should not use generators.",
      },
      {
        selector: "ObjectPattern, ArrayPattern",
        message: "Avoid destructuring in CloudFront Functions JS2 files.",
      },
      {
        selector: "SpreadElement, RestElement",
        message: "Avoid spread/rest syntax in CloudFront Functions JS2 files.",
      },
      {
        selector: "ForOfStatement",
        message:
          "Avoid for...of in CloudFront Functions JS2 files. Use index-based loops instead.",
      },
    ],
    "no-unused-vars": ["error", { varsIgnorePattern: "^handler$" }],
    "@typescript-eslint/no-unused-vars": [
      "error",
      { varsIgnorePattern: "^handler$" },
    ],
  },
});
