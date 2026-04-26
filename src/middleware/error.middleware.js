function errorHandler(err, req, res, next) {
  console.error(err.stack);

  if (err.name === 'PrismaClientKnownRequestError') {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: { message: 'A record with that value already exists' } });
    }
  }

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';
  res.status(statusCode).json({ error: { message } });
}

module.exports = { errorHandler };