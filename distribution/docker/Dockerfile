# The release workflow places the matching Linux binary in dist/docker/$TARGETARCH.
FROM debian:bookworm-slim AS base

ARG TARGETARCH

RUN groupadd --system --gid 65532 myadmin \
  && useradd --system --uid 65532 --gid 65532 --home-dir /data --no-create-home myadmin \
  && mkdir --mode=0750 /data \
  && chown 65532:65532 /data

COPY dist/docker/${TARGETARCH}/myadmin /usr/local/bin/myadmin

RUN chmod 0755 /usr/local/bin/myadmin

VOLUME ["/data"]
USER 65532:65532
ENTRYPOINT ["/usr/local/bin/myadmin", "serve", "--host", "0.0.0.0", "--data-dir", "/data"]

FROM base AS runtime

FROM base AS tools
USER root
RUN apt-get update \
  && apt-get install --no-install-recommends --yes ca-certificates default-mysql-client postgresql-client \
  && rm -rf /var/lib/apt/lists/*
USER 65532:65532
