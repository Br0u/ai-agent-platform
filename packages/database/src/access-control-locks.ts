// All transactions that can replace role-permission sets must acquire this
// transaction-scoped advisory lock before reading or locking roles/permissions.
export const ACCESS_CONTROL_PERMISSION_MUTATION_LOCK_KEY = 72_134_878;
