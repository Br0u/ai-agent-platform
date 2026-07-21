FROM aap-backup-lifecycle-base-task9

USER root
COPY --chmod=0555 docs/testing/fixtures/restore-docker-lifecycle/copy-gpg /usr/local/bin/gpg
USER postgres
