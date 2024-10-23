# FROM python:3.7.17-slim-bullseye as base_build
# RUN apt-get update
# RUN apt-get install build-essential sudo curl cron -y --no-install-recommends

# FROM base_build as ta_lib_build
# WORKDIR /app
# COPY . .
# RUN ./src/install-ta-lib.sh

# FROM ta_lib_build as python_build
FROM scd1000/ta-lib-python-3.7.17:0.4.0 as installer
WORKDIR /app
COPY . .
RUN pip install -r requirements.txt

FROM installer
ENV PYTHONUNBUFFERED=0
CMD ["python", "-u", "/app/test.py"]
