const nodeExternals = require('webpack-node-externals');

module.exports = function (options) {
  return {
    ...options,
    externals: [
      nodeExternals({
        allowlist: [
          '@nestjs/jwt',
          '@nestjs/config',
          /^@nestjs\/jwt\//,
          /^@nestjs\/config\//,
        ],
      }),
    ],
    output: {
      ...options.output,
      library: {
        type: 'commonjs2',
      },
    },
  };
};
