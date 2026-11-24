require("ts-node").register({ project: require.resolve("./tsconfig.configs.json"), transpileOnly: true });
module.exports = require("./eslint.config.ts").default;
