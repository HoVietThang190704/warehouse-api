const serverlessModule = require('../dist/apps/api-gateway/serverless.js');
const handler = serverlessModule.default || serverlessModule;

module.exports = handler;
