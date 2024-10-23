import { Pool } from 'pg';

// Configure the database connection options
const pool = new Pool({
  user: process.env.POSTGRES_USER,
  host: 'postgres',
  database: process.env.POSTGRES_DB,
  password: process.env.POSTGRES_PASSWORD,
  port: 5432
});

pool.on('connect', () => {
  console.log('New postgres connection successful')
});

async function queryDatabase(query = '') {
  const client = await pool.connect();

  try {
    const result = await client.query(query);

    console.log('Query Result:', result.rows);
  } catch (error) {
    console.error('Error executing query:', error);
  } finally {
    client.release();
  }
}

// Close the connection pool when the application exits
process.on('SIGINT', () => {
  pool.end().then(() => {
    console.log('Database pool has been closed.');
    process.exit(0);
  });
});

export { queryDatabase }
