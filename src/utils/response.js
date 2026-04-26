function success(res, data, statusCode = 200, meta = null) {
  const body = { data };
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
}

function error(res, message, statusCode = 400, details = null) {
  const body = { error: { message } };
  if (details) body.error.details = details;
  return res.status(statusCode).json(body);
}

module.exports = { success, error };