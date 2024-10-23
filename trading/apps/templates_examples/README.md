# Examples

A collection of scripts that should help get a new strategy app up and running

### redis.py

An example connector to redis that will listen to the 1 minute aggregation keyspace on redis to trigger a rerun of a strategy function

If running the signal functions in a thread the following env needs setting in the Dockerfile
```
ENV PYTHONUNBUFFERED=0
```
And the python main script must be started with `-u`, e.g.
```
CMD ["python", "-u", "/app/main.py"]
```
