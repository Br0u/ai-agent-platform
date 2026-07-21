# Restore Drill Docker Lifecycle Design

## Goal

Make every Docker CLI operation in `infra/docker/restore-drill.sh` bounded,
tracked, diagnostically contained, and recoverable after failures or signals.
Preserve the existing backup validation, database, role, migration, digest,
space, and status-code contracts.

## Architecture

Use one POSIX-sh Docker supervisor and one file-backed resource registry.
The supervisor is the only function allowed to invoke `docker`. It receives a
timeout, phase, explicit stdout file, explicit diagnostic file, and Docker
arguments. It tracks the active PID, terminates it within the configured grace
period, and reports `SUCCESS` or `AMBIGUOUS` without
printing captured output.

The registry lives below the mode-0700 restore temporary directory. Each
registered resource has mode-0600 files containing only its controlled key,
type, exact generated name, and create outcome. A resource is registered as
`AMBIGUOUS` before its create request. A normal zero exit changes it to
`SUCCESS`. Once the create request is launched, every nonzero result—including
connection or response failure, timeout, signal, and supervisor termination—
keeps it `AMBIGUOUS`; generic Docker CLI status cannot prove non-creation.
Registry records never contain command arguments, paths, output, or diagnostics.

Every restore container uses an exact unique name and the same lifecycle:
register, bounded create, bounded start, bounded wait or exec, and one cleanup
reconciliation. This includes decrypt, bundle validation, dump digest,
PostgreSQL, and Skill Registry migration containers. The database volume uses
the equivalent register, bounded create, and reconcile lifecycle. Anonymous
`docker run --rm` and `docker run -d` are forbidden.

## Cleanup and create races

EXIT and INT/TERM handlers ignore further INT/TERM as their first action. A
signal handler records and reports the first signal status, then exits; only
the EXIT handler owns cleanup. The EXIT trap passes the original status into
its handler so ignoring signals does not overwrite it. Cleanup terminates the
active supervised CLI, walks the registry exactly once, reconciles each
resource, then removes the temporary directory. No resource has a separate
eager reconcile plus an EXIT retry.

For `SUCCESS` creates, a successful bounded remove resolves the resource. If
remove fails, only two consecutive successful exact-name empty queries confirm
absence; an exact name is `EXISTS`, and timeout, nonzero, or unexpected output
is `UNKNOWN`.

For `AMBIGUOUS` creates, quick `ABSENT` observations never resolve the
resource. Reconciliation continues for
`RESTORE_DOCKER_CREATE_SETTLE_SECONDS` (default 5, valid integer range 1..300)
and succeeds only after a bounded remove succeeds. It uses a wall-clock
deadline, checks that deadline before every remove or query, and waits 0.1
seconds between unsuccessful cycles. One already-started Docker call may add at
most its configured CLI timeout plus kill grace beyond the deadline. This
catches a delayed daemon-side create. If no definitive removal occurs before
the window closes, cleanup fails closed with `restore drill cleanup failed`.

All cleanup diagnostics are generic. Docker stdout and stderr remain separate
mode-0600 files and are never replayed. A temporary-directory removal failure
sets the same cleanup-failed state. Original nonzero and first-signal statuses
remain authoritative; cleanup failure changes only an otherwise successful
exit to status 1.

## Output handling

Every supervised Docker call receives explicit stdout and diagnostic files.
Commands with relevant stdout parse only the expected non-sensitive scalar,
such as an exact resource name, a container wait status, a digest, a count, or
a schema contract. Other output remains captured and unreported.

## Tests

Add a static contract that permits the literal Docker invocation only inside
the supervisor and rejects anonymous `--rm`. Dynamic fake-Docker tests cover
hung late phases, delayed late create on a transient late resource, permanent
unknown state, double signals, minimum reconciliation configuration, and both
nonzero-main-flow and successful-main-flow temporary-directory removal
failure. Tests also assert the registry modes and its non-sensitive field
allowlist. Existing lifecycle, bundle, manifest, digest, trigger, role, fsync,
space, status, and diagnostic-containment tests remain green. Final acceptance
also includes shell/type/format/Compose checks, three real-Docker paths, and a
six-axis residue audit.
