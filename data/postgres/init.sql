-- Create a new database
CREATE DATABASE trade;

-- Connect to the new database
\c trade;

-- Create tables
CREATE TABLE IF NOT EXISTS trades_placed(
  id INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  created_at TIMESTAMP NOT NULL,
  open DECIMAL(24,18) NOT NULL,
  stop_loss DECIMAL(24,18) NOT NULL,
  take_profit DECIMAL(24,18) NOT NULL,
  amount DECIMAL(4,2) NOT NULL
);
