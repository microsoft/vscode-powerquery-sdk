import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("ts-node").register({ project: require.resolve("./tsconfig.json"), transpileOnly: true });

export default require("./.vscode-test.ts").default;
