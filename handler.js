/**
 * Lambda handler - wraps Express app for serverless deployment
 * Uses serverless-http to adapt API Gateway events to Express req/res
 */
const serverless = require('serverless-http');
const app = require('./app');

// Pre-process API Gateway event to fix common body parsing issues
const preprocessEvent = (event) => {
  const evt = { ...event };
  // Fix: API Gateway may leave Content-Encoding: gzip after decompressing,
  // causing body-parser to fail. Remove it so Express parses the body correctly.
  if (evt.headers) {
    const headers = { ...evt.headers };
    Object.keys(headers).forEach((key) => {
      if (key.toLowerCase() === 'content-encoding' && headers[key] === 'gzip') {
        delete headers[key];
      }
    });
    evt.headers = headers;
  }
  // HTTP API (v2) uses lowercase header keys - ensure Content-Type is set for JSON body
  if (evt.body && evt.headers && !evt.headers['content-type'] && !evt.headers['Content-Type']) {
    evt.headers['content-type'] = 'application/json';
  }
  return evt;
};

const slsHandler = serverless(app, {
  binary: ['image/*', 'application/pdf', 'application/octet-stream'],
});

module.exports.handler = async (event, context) => {
  return slsHandler(preprocessEvent(event), context);
};
