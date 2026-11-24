require("ts-node").register({
    project: require.resolve("../../../tsconfig.configs.json"),
    transpileOnly: true,
});
require("./start.ts");
