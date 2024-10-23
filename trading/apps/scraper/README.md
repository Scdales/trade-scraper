# Scraper

An IG Markets spread betting orientated scraper that hooks into tick data and injests it into a redis timeseries database

### Timeframe Aggregations
For each epic listed in `src/index.ts`, it will create rules to aggregate the time series (bid and offer separately) data into the timeframes:
- 1 Minute
- 15 Minutes
- 30 Minutes
- 1 Hour
- 4 Hours
- 1 Day

### Calculation Aggregations
For each timeframe. The follow calculations are applied and put into their own respective timeseries buckets.
- Minimum
- Maximum
- First
- Last
- Standard Deviation
- Standard Variance
