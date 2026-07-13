FROM postgres:18.3-alpine3.23

USER root
RUN apk add --no-cache gnupg \
  && mkdir -p /backups \
  && chown postgres:postgres /backups
COPY --chmod=0555 infra/docker/validate-backup-key.sh /usr/local/bin/validate-backup-key.sh
COPY --chmod=0555 infra/docker/backup.sh /usr/local/bin/aap-backup

USER postgres
ENTRYPOINT ["/usr/local/bin/aap-backup"]
