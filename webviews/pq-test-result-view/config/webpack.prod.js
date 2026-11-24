require("ts-node").register({
    project: require.resolve("../../../tsconfig.configs.json"),
    transpileOnly: true,
});
module.exports = require("./webpack.prod.ts").default;
