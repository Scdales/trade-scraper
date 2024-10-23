# Trade Scraper

A project that begun to work with spread betting market providers, but later became a platform to test crypto arbitrage and signal strategies

## SETUP

### Root .env file
File will need to contain the following values
```
REDIS_PASSWORD=some-redis-password
HOST=<SECRET> || localhost # or wherever you're deploying
POSTGRES_USER=user
POSTGRES_PASSWORD=hehehehehe
POSTGRES_DB=trade
IG_API_KEY=ig-markets-api-key
IG_IS_DEMO=true
IG_BASE_URL=api.ig.com/gateway/deal
IG_IDENTIFIER=ig-markets-account-api-identifier
IG_PASSWORD=ig-markets-account-api-password
REDIS_HOST=cache # | localhost - for running scripts outside of docker
IG_EPICS="
CS.D.EURUSD.CFD.IP
CS.D.USDCAD.CFD.IP
" # Epics to subscribe to pricing data injestion with ./trading/apps/scraper
```

### V Useful Guides
Shit that i've referenced many (many) times

- [Build Your Financial Application on RedisTimeSeries | Redis](https://redis.com/blog/build-your-financial-application-on-redistimeseries/)
- [SSO for your App via Auth0 + Nginx + Docker + Vouch-Proxy](https://sebastianwallkoetter.wordpress.com/2020/11/01/sso-for-your-app/)
- [IG Labs](https://labs.ig.com)

### Notes

Regex to update redis datasource in exported json
`("datasource": )(\{[^\}]*redis-datasource[^\}]*\})` to capture

On a linux/debian server, /etc/default/grub may need an update to get node-exporter to scrape some system metrics for prometheus:

> You need to enable memory cgroup. This is a kernel configuration.
> Add a kernel boot option "cgroup_enable=memory" to your bootloader setting
> (e.g. /etc/default/grub) to enable it.
https://github.com/google/cadvisor/issues/432

`GRUB_CMDLINE_LINUX_DEFAULT="cgroup_enable=memory swapaccount=1"`

then

`update-grub2 && reboot`


Cron job to back up data/cache/dump.rdb + retention rules - maybe

Set system timezone to utc with:
timedatectl set-timezone UTC
timedatectl status


Needed to get /var/log/auth.log bag (and fail2ban start working):
`sudo apt-get install rsyslog`

## Ping off:
`echo "1" > /proc/sys/net/ipv4/icmp_echo_ignore_all`

## Ping on:
`echo "0" > /proc/sys/net/ipv4/icmp_echo_ignore_all`
