const mongoose = require('mongoose');

const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;

const mongooseOptions = {
  serverSelectionTimeoutMS: 20000,
  connectTimeoutMS: 20000,
  socketTimeoutMS: 45000,
  maxPoolSize: isLambda ? 5 : 10,
  minPoolSize: isLambda ? 0 : 1,
  maxIdleTimeMS: isLambda ? 55000 : 60000,
  // Do not queue operations while disconnected — we await connect in the Lambda handler first
  bufferCommands: false,
  family: 4,
};

function getDbUrl() {
  return process.env.DB_URL;
}

const g = global;
if (!g.__dashboardMongoose) {
  g.__dashboardMongoose = { connecting: null };
}
const cache = g.__dashboardMongoose;

/**
 * Resolves when MongoDB is ready. Safe to call on every Lambda invocation;
 * returns immediately when already connected (warm container).
 */
async function ensureConnected() {
  const ready = mongoose.connection.readyState === 1;
  if (ready) return;

  const url = getDbUrl();
  if (!url || typeof url !== 'string' || !url.trim()) {
    throw new Error('DB_URL environment variable is not set');
  }

  if (cache.connecting) {
    await cache.connecting;
    if (mongoose.connection.readyState === 1) return;
    cache.connecting = null;
  }

  cache.connecting = mongoose
    .connect(url.trim(), mongooseOptions)
    .then(() => {
      console.log('MongoDB connected');
    })
    .catch((err) => {
      cache.connecting = null;
      console.error('MongoDB connection failed:', err.message);
      throw err;
    });

  await cache.connecting;
}

module.exports = { ensureConnected, mongoose };
