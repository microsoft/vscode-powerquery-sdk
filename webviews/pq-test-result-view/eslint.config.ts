/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import js from "@eslint/js";
import type { ESLint, Linter } from "eslint";

interface RecommendedPlugin extends ESLint.Plugin {
    configs: {
        recommended: {
            rules: Linter.RulesRecord;
        };
    };
}

const licenseHeaderPlugin: ESLint.Plugin = require("eslint-plugin-license-header");
const importPlugin: RecommendedPlugin = require("eslint-plugin-import");
const reactPlugin: RecommendedPlugin = require("eslint-plugin-react");
const reactHooksPlugin: ESLint.Plugin = require("eslint-plugin-react-hooks");
const typescript: RecommendedPlugin = require("@typescript-eslint/eslint-plugin");
const typescriptParser: Linter.Parser = require("@typescript-eslint/parser");
const reactHooksRules: Linter.RulesRecord = (
    reactHooksPlugin.configs?.["recommended-latest-legacy"] as Linter.LegacyConfig
).rules as Linter.RulesRecord;

const config: Linter.Config[] = [
    {
        ignores: ["dist/**", "build/**", "node_modules/**", "*.js", "*.d.ts", "config/**"],
    },
    js.configs.recommended,
    {
        files: ["**/*.ts", "**/*.tsx"],
        languageOptions: {
            parser: typescriptParser,
            parserOptions: {
                ecmaVersion: "latest",
                sourceType: "module",
                ecmaFeatures: {
                    jsx: true,
                },
                project: "./tsconfig.json",
            },
            globals: {
                React: "readonly",
                JSX: "readonly",
                window: "readonly",
                document: "readonly",
                console: "readonly",
                setTimeout: "readonly",
                clearTimeout: "readonly",
                setInterval: "readonly",
                clearInterval: "readonly",
                fetch: "readonly",
                Headers: "readonly",
                getComputedStyle: "readonly",
                acquireVsCodeApi: "readonly",
            },
        },
        plugins: {
            "@typescript-eslint": typescript,
            react: reactPlugin,
            "react-hooks": reactHooksPlugin,
            import: importPlugin,
            "license-header": licenseHeaderPlugin,
        },
        rules: {
            ...typescript.configs.recommended.rules,
            ...reactPlugin.configs.recommended.rules,
            ...reactHooksRules,
            ...importPlugin.configs.recommended.rules,
            "no-console": "warn",
            "@typescript-eslint/no-explicit-any": "warn",
            "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
            "@typescript-eslint/no-empty-object-type": "off",
            "react/react-in-jsx-scope": "off",
            "react/prop-types": "off",
            "react/display-name": "off",
            "import/no-unresolved": [
                "error",
                {
                    ignore: ["^@fluentui/", "^react$", "^react-dom$"],
                },
            ],
            "import/named": "off",
            "license-header/header": ["error", "../../resources/license-header.js"],
        },
        settings: {
            react: {
                version: "detect",
            },
            "import/resolver": {
                typescript: {
                    project: "./tsconfig.json",
                },
                node: {
                    extensions: [".js", ".jsx", ".ts", ".tsx"],
                },
            },
        },
    },
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
        rules: {
            "no-console": "warn",
        },
    },
];

export default config;
