/** DB_* değişkenlerinden bağlantı adresi üretir; DATABASE_URL tanımlıysa onu kullanır. */
export function getDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const { DB_HOST, DB_PORT = "3306", DB_USER = "", DB_PASSWORD = "", DB_NAME = "" } = process.env;
  if (!DB_HOST) return "";
  const auth = `${encodeURIComponent(DB_USER)}:${encodeURIComponent(DB_PASSWORD)}`;
  return `mysql://${auth}@${DB_HOST}:${DB_PORT}/${encodeURIComponent(DB_NAME)}`;
}
