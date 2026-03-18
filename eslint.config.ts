import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import eslint from "@eslint/js";
import vitest from "@vitest/eslint-plugin";
import { defineConfig } from "eslint/config";
import prettier from "eslint-config-prettier";
import { jsdoc } from "eslint-plugin-jsdoc";
import noSecrets from "eslint-plugin-no-secrets";
import security from "eslint-plugin-security";
import unicorn from "eslint-plugin-unicorn";
import globals from "globals";
import tseslint from "typescript-eslint";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig(
  // ── Global ignores ──────────────────────────────────────
  {
    ignores: ["dist/", "**/.coverage/*", "node_modules/", "*.config.ts"],
  },

  // ── Base ESLint recommended ─────────────────────────────
  eslint.configs.recommended,

  // ── TypeScript (strictest level + type-aware) ───────────
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // ── General settings for all TS files ───────────────────
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      // ── TypeScript overrides & additions ──────────────
      "@typescript-eslint/explicit-function-return-type": "error",
      "@typescript-eslint/explicit-module-boundary-types": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/consistent-type-exports": [
        "error",
        { fixMixedExportsWithInlineTypeSpecifier: true },
      ],
      "@typescript-eslint/no-import-type-side-effects": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/no-unnecessary-condition": "error",
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      "@typescript-eslint/strict-boolean-expressions": "error",
      "no-await-in-loop": "error", // catches sequential awaits that should be Promise.all()
      "no-template-curly-in-string": "error", // catches '${name}' in regular strings (missing backticks)
      "no-promise-executor-return": "error", // catches accidental return in new Promise((resolve) => return ...)
      "no-unreachable-loop": "error", // catches loops that only ever run once
      "no-param-reassign": "error", // prevents mutating function parameters (major bug source)
      "prefer-const": "error", // const over let when never reassigned
      "object-shorthand": ["error", "always"], // { foo: foo } → { foo }
      "prefer-template": "error", // template literals over string concatenation
      "@typescript-eslint/prefer-readonly": "error", // flags private fields that are never reassigned
      "@typescript-eslint/require-array-sort-compare": "error", // prevents [1, 10, 2].sort() (lexicographic surprise)
      "@typescript-eslint/naming-convention": [
        "error",
        {
          selector: ["property", "objectLiteralProperty", "typeProperty"],
          format: ["camelCase", "PascalCase"],
          leadingUnderscore: "allow",
        },
        {
          selector: "default",
          format: ["camelCase"],
          leadingUnderscore: "allow",
        },
        {
          selector: "typeLike",
          format: ["PascalCase"],
        },
        {
          selector: "enumMember",
          format: ["PascalCase"],
        },
        {
          selector: "variable",
          modifiers: ["const", "exported"],
          format: ["camelCase", "UPPER_CASE"],
        },
      ],

      // ── General quality ──────────────────────────────
      "no-console": "warn",
      eqeqeq: ["error", "always"],
      curly: ["error", "all"],
      "@typescript-eslint/only-throw-error": "error",
    },
  },

  // ── Security (low cost security checks) ────────────────
  // TODO: Remove cast when eslint-plugin-security fixes defineConfig() types
  // https://github.com/eslint-community/eslint-plugin-security/issues/175
  security.configs.recommended as any,

  // ── Unicorn (modern JS best practices) ──────────────────
  // https://github.com/sindresorhus/eslint-plugin-unicorn?tab=readme-ov-file#recommended-config
  unicorn.configs.recommended,
  {
    rules: {
      "unicorn/better-regex": "warn",
      "unicorn/prevent-abbreviations": "off",
    },
  },

  // ── Vitest (test files only) ────────────────────────────
  {
    files: ["**/*.test.ts"],
    plugins: {
      vitest,
    },
    rules: {
      ...vitest.configs.recommended.rules,
      "vitest/consistent-test-it": ["error", { fn: "it" }],
      "vitest/no-focused-tests": "error",
      "vitest/no-disabled-tests": "warn",
      "vitest/no-duplicate-hooks": "error",
      "vitest/prefer-to-be": "error",
      "vitest/prefer-to-have-length": "error",
      "vitest/prefer-strict-equal": "error",
      "vitest/require-top-level-describe": "error",
      "vitest/expect-expect": "off",

      // Relax some rules that are too strict for test files
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "import-x/no-default-export": "off",
    },
  },

  // ── Config files (allow default exports) ────────────────
  {
    files: ["*.config.ts", "*.config.js"],
    rules: {
      "import-x/no-default-export": "off",
    },
  },

  // ── No Secrets (detect accidental secret inclusion) ────────
  {
    plugins: { "no-secrets": noSecrets },
    rules: {
      "no-secrets/no-secrets": "error",
    },
  },

  // ── JSDoc (enforce minimal doc commenting) ────────────────
  jsdoc({
    config: "flat/recommended-error",
  }),
  {
    rules: {
      "jsdoc/require-param": "off",
      "jsdoc/require-returns": "off",
      "jsdoc/require-param-description": "off",
      "jsdoc/require-returns-description": "off",
      "jsdoc/require-yields": "off",
      "jsdoc/require-description": [
        "error",
        {
          descriptionStyle: "body",
          checkConstructors: false,
          checkGetters: false,
          checkSetters: false,
        },
      ],
      "jsdoc/require-jsdoc": [
        "error",
        {
          contexts: [
            "ClassDeclaration",
            "ExportNamedDeclaration > VariableDeclaration[kind='const'] > VariableDeclarator[init.type='ObjectExpression']",
            "ExportNamedDeclaration > VariableDeclaration[kind='const'] > VariableDeclarator[init.type='ArrayExpression']",
            "ExportNamedDeclaration > VariableDeclaration[kind='const'] > VariableDeclarator[init.type='NewExpression']",
            "ExportNamedDeclaration > VariableDeclaration[kind='const'] > VariableDeclarator[init.type='CallExpression']",
          ],
          publicOnly: true,
          checkConstructors: false,
          require: {
            FunctionDeclaration: true,
            MethodDefinition: true,
            ClassDeclaration: true,
          },
        },
      ],
    },
  },

  // ── Prettier (must be last — disables conflicting rules)
  prettier,
);
