// Compatibilidad para Auth.js: su persistencia pertenece al adaptador PostgreSQL.
export { getPool, ensureDatabase } from './infrastructure/postgresStore'
