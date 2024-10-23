# NGINX

Setup to do a couple of things

## Vouch Proxy
Redirects to the vouch proxy service, set up for Auth0, to enforce auth across public facing uis

## Custom Error Pages
A custom error page is set up to handle all error codes/pages nginx generates, with a jurassic park theme...

## Self Signed Certs
Used:
```
docker run --rm -it -v$PWD:/certs firefoxmetzger/create_localhost_ssl
```
To generate a self signed cert. Just accept it in your browser, it's safe I promise
