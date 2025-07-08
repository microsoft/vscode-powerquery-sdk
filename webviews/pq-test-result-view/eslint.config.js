const js = require("@eslint/js");
const typescript = require("@typescript-eslint/eslint-plugin");
const typescriptParser = require("@typescript-eslint/parser");
const reactPlugin = require("eslint-plugin-react");
const reactHooksPlugin = require("eslint-plugin-react-hooks");
const jsxA11yPlugin = require("eslint-plugin-jsx-a11y");
const importPlugin = require("eslint-plugin-import");
const licenseHeaderPlugin = require("eslint-plugin-license-header");

module.exports = [
    // Global ignores
    {
        ignores: ["dist/**", "build/**", "node_modules/**", "*.js", "*.d.ts", "config/**"],
    },

    // Base configuration for all files
    js.configs.recommended,

    // TypeScript/React configuration
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
            "jsx-a11y": jsxA11yPlugin,
            import: importPlugin,
            "license-header": licenseHeaderPlugin,
        },
        rules: {
            ...typescript.configs.recommended.rules,
            ...reactPlugin.configs.recommended.rules,
            ...reactHooksPlugin.configs.recommended.rules,
            ...jsxA11yPlugin.configs.recommended.rules,
            ...importPlugin.configs.recommended.rules,

            // Custom rules
            "no-console": "warn",
            "@typescript-eslint/no-explicit-any": "warn",
            "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
            "@typescript-eslint/no-empty-object-type": "off", // Allow empty object types for React props
            "react/react-in-jsx-scope": "off", // React 17+ doesn't need this
            "react/prop-types": "off", // TypeScript handles prop validation
            "react/display-name": "off", // Not needed for function components
            "import/no-unresolved": [
                "error",
                {
                    ignore: ["^@fluentui/", "^react$", "^react-dom$"],
                },
            ],
            "import/named": "off", // Can be problematic with FluentUI exports

            // License header rules
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

    // JavaScript configuration
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
