/**
 * Lambda handler - wraps Express app for serverless deployment
 * Uses serverless-http to adapt API Gateway events to Express req/res
 */
const serverless = require('serverless-http');
const app = require('./app');
const { ensureConnected } = require('./lib/mongo');

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
  // Reuse DB connection across warm Lambda invocations instead of waiting for event loop to drain
  context.callbackWaitsForEmptyEventLoop = false;

  // EventBridge scheduled warm-up — establish DB connection so user traffic avoids cold DB
  if (event.source === 'aws.events' || event['detail-type'] === 'Scheduled Event') {
    try {
      await ensureConnected();
    } catch (e) {
      console.warn('warm: DB connect skipped', e.message);
    }
    return { statusCode: 200, body: 'warm' };
  }

  try {
    await ensureConnected();
  } catch (err) {
    console.error('handler: database unavailable', err.message);
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Database temporarily unavailable',
        code: 'DB_CONNECTION',
      }),
    };
  }

  return slsHandler(preprocessEvent(event), context);
};
