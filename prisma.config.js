require('dotenv').config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Add it to .env before running Prisma commands.');
}

module.exports = {
  datasource: {
    url: process.env.DATABASE_URL,
  },
};
