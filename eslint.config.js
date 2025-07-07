const js = require("@eslint/js");
const typescript = require("@typescript-eslint/eslint-plugin");
const typescriptParser = require("@typescript-eslint/parser");
const prettierPlugin = require("eslint-plugin-prettier");
const securityPlugin = require("eslint-plugin-security");
const prettierConfig = require("eslint-config-prettier");

module.exports = [
    // Global ignores
    {
        ignores: ["dist/**", "out/**", "node_modules/**", "webviewDist/**", "*.vsix", "*.min.js", "*.d.ts"],
    },

    // Base configuration for all files
    js.configs.recommended,

    // TypeScript configuration
    {
        files: ["**/*.ts"],
        languageOptions: {
            parser: typescriptParser,
            parserOptions: {
                project: "./tsconfig.json",
                ecmaVersion: "latest",
                sourceType: "module",
            },
            globals: {
                require: "readonly",
                module: "readonly",
                process: "readonly",
                console: "readonly",
                Buffer: "readonly",
                global: "readonly",
                __dirname: "readonly",
                __filename: "readonly",
                setTimeout: "readonly",
                clearTimeout: "readonly",
                setInterval: "readonly",
                clearInterval: "readonly",
                NodeJS: "readonly",
                Thenable: "readonly",
                AbortSignal: "readonly",
                URL: "readonly",
            },
        },
        plugins: {
            "@typescript-eslint": typescript,
            security: securityPlugin,
            prettier: prettierPlugin,
        },
        rules: {
            ...typescript.configs.recommended.rules,
            ...securityPlugin.configs.recommended.rules,
            ...prettierConfig.rules,

            // Custom TypeScript rules
            "@typescript-eslint/no-inferrable-types": "off",
            "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
            "@typescript-eslint/typedef": [
                "error",
                {
                    arrowParameter: true,
                    variableDeclaration: true,
                    variableDeclarationIgnoreFunction: true,
                    arrayDestructuring: true,
                    memberVariableDeclaration: true,
                    objectDestructuring: true,
                    parameter: true,
                    propertyDeclaration: true,
                },
            ],
            "@typescript-eslint/no-explicit-any": "warn",
            "@typescript-eslint/await-thenable": "error",
            "@typescript-eslint/consistent-type-assertions": ["warn", { assertionStyle: "as" }],
            "@typescript-eslint/explicit-function-return-type": "error",
            "@typescript-eslint/no-floating-promises": "error",
            "@typescript-eslint/no-namespace": "error",
            "@typescript-eslint/prefer-namespace-keyword": "error",
            "@typescript-eslint/switch-exhaustiveness-check": "error",
            "@typescript-eslint/unified-signatures": "error",

            // Prettier rules
            "prettier/prettier": ["error"],

            // Security rules
            "security/detect-non-literal-fs-filename": "off",
            "security/detect-object-injection": "off",

            // Core ESLint rules
            "array-callback-return": "error",
            "arrow-body-style": ["error", "as-needed"],
            "constructor-super": "error",
            "max-len": [
                "warn",
                {
                    code: 120,
                    ignorePattern: "^(?!.*/(/|\\*) .* .*).*$",
                },
            ],
            "no-async-promise-executor": "error",
            "no-await-in-loop": "error",
            "no-class-assign": "error",
            "no-compare-neg-zero": "error",
            "no-cond-assign": "error",
            "no-constant-condition": "error",
            "no-dupe-else-if": "error",
            "no-dupe-keys": "error",
            "no-duplicate-imports": "error",
            "no-restricted-globals": "error",
            "no-eval": "error",
            "no-extra-boolean-cast": "error",
            "no-fallthrough": "error",
            "no-func-assign": "error",
            "no-global-assign": "error",
            "no-implicit-coercion": "error",
            "no-implicit-globals": "error",
            "no-implied-eval": "error",
            "no-invalid-this": "error",
            "no-irregular-whitespace": "error",
            "no-lone-blocks": "error",
            "no-lonely-if": "error",
            "no-loss-of-precision": "error",
            "no-nested-ternary": "error",
            "no-self-assign": "error",
            "no-self-compare": "error",
            "no-sparse-arrays": "error",
            "no-this-before-super": "error",
            "no-unreachable": "error",
            "no-unsafe-optional-chaining": "error",
            "no-unused-private-class-members": "error",
            "no-useless-backreference": "error",
            "no-useless-catch": "error",
            "no-useless-computed-key": "error",
            "no-useless-concat": "error",
            "no-useless-rename": "error",
            "no-useless-return": "error",
            "object-shorthand": ["error", "always"],
            "one-var": ["error", "never"],
            "padding-line-between-statements": [
                "warn",
                {
                    blankLine: "always",
                    prev: "*",
                    next: [
                        "class",
                        "do",
                        "for",
                        "function",
                        "if",
                        "multiline-block-like",
                        "multiline-const",
                        "multiline-expression",
                        "multiline-let",
                        "multiline-var",
                        "switch",
                        "try",
                        "while",
                    ],
                },
                {
                    blankLine: "always",
                    prev: [
                        "class",
                        "do",
                        "for",
                        "function",
                        "if",
                        "multiline-block-like",
                        "multiline-const",
                        "multiline-expression",
                        "multiline-let",
                        "multiline-var",
                        "switch",
                        "try",
                        "while",
                    ],
                    next: "*",
                },
                {
                    blankLine: "always",
                    prev: "*",
                    next: ["continue", "return"],
                },
            ],
            "prefer-template": "error",
            "require-atomic-updates": "error",
            "require-await": "warn",
            "spaced-comment": ["warn", "always"],
            "sort-imports": ["error", { allowSeparatedGroups: true, ignoreCase: true }],
            "valid-typeof": "error",
        },
    },

    // Test-specific configuration
    {
        files: ["src/test/**/*.ts"],
        languageOptions: {
            globals: {
                suite: "readonly",
                suiteSetup: "readonly",
                suiteTeardown: "readonly",
                test: "readonly",
                describe: "readonly",
                it: "readonly",
                before: "readonly",
                after: "readonly",
                beforeEach: "readonly",
                afterEach: "readonly",
            },
        },
        rules: {
            "no-await-in-loop": "off",
            "@typescript-eslint/typedef": "off",
            "@typescript-eslint/no-floating-promises": "off",
            "@typescript-eslint/prefer-namespace-keyword": "off",
            "@typescript-eslint/no-non-null-assertion": "off",
            "@typescript-eslint/no-namespace": "off",
        },
    },

    // Unit tests configuration
    {
        files: ["unit-tests/**/*.ts"],
        languageOptions: {
            parser: typescriptParser,
            parserOptions: {
                project: "./tsconfig.json",
            },
            globals: {
                require: "readonly",
                module: "readonly",
                process: "readonly",
                console: "readonly",
                Buffer: "readonly",
                global: "readonly",
                __dirname: "readonly",
                __filename: "readonly",
            },
        },
        rules: {
            "@typescript-eslint/ban-ts-comment": "off",
            "@typescript-eslint/typedef": "off",
            "prefer-const": "off",
        },
    },

    // JavaScript files configuration
    {
        files: ["**/*.js"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "commonjs",
            globals: {
                require: "readonly",
                module: "readonly",
                process: "readonly",
                console: "readonly",
                Buffer: "readonly",
                global: "readonly",
                __dirname: "readonly",
                __filename: "readonly",
            },
        },
    },
];
