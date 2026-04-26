const { verifyAccessToken } = require('../utils/jwt');
const { error } = require('../utils/response');

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || '';

  if (!authHeader.startsWith('Bearer ')) {
    return error(res, 'Authorization token is required', 401);
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return error(res, 'Authorization token is required', 401);
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = payload;
    return next();
  } catch {
    return error(res, 'Invalid or expired access token', 401);
  }
}

module.exports = { authenticate };