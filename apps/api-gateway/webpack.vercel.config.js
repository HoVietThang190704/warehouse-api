module.exports = function (options) {
  return {
    ...options,
    output: {
      ...options.output,
      library: {
        type: 'commonjs2',
      },
    },
  };
};
