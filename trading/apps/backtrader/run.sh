docker build -t tmp . && docker run --env-file ../../../.env --network ig-trader_default --rm -it tmp; docker image rm tmp
