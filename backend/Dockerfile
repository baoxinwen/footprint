FROM python:3.12-slim AS builder
WORKDIR /build
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.12-slim
WORKDIR /app
COPY --from=builder /install /usr/local
RUN groupadd --gid 10001 footprint \
    && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin footprint
COPY . .
RUN mkdir -p /app/data /app/uploads \
    && chown -R footprint:footprint /app/data /app/uploads
USER footprint
EXPOSE 8000
CMD ["/bin/sh", "-eu", "-c", "if [ \"$(id -u)\" -eq 0 ] || [ \"$(id -g)\" -eq 0 ]; then echo \"Refusing to run backend as root\" >&2; exit 1; fi; umask 077; exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips=\"${BACKEND_TRUSTED_PROXIES:-*}\" --no-access-log"]
