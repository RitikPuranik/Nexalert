"use strict";

/**
 * Wraps an async route handler so any thrown error is passed to next().
 * Eliminates boilerplate try/catch in every handler.
 *
 * Usage:  router.get("/", asyncHandler(async (req, res) => { ... }))
 */
function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };
