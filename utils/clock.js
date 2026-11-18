/**
 * Server clock. Everything time-sensitive (e.g. the Everyday Expenses lock) must call
 * clock.now() instead of new Date(), so behaviour depends only on the server's clock
 * and tests can pin the time.
 */
module.exports = {
  now: () => new Date(),
};
