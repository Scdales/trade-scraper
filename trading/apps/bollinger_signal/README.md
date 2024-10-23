# Bollinger Bands Signal

This tries to use a combination of bollinger bands and SMAs from all timeframes to trigger decision

The idea is:

SMA is aligned across 1 Day, 4 Hour, 1 Hour, 30 Mins, and 15 Mins
1 min close is within 5% of top/bottom bollinger line

## TA-LIB

This project packages the very important [ta-lib](https://ta-lib.org/). Check out the `Dockerfile` to see how it was packaged into the container.
Configuring, compiling, and building takes a good while on first load, so take note of the use of build stages in the dockerfile
