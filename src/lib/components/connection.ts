type NetworkInformation = {
  saveData?: boolean;
  effectiveType?: string;
};

/** Data-saver or a 2g/3g effective type. Same test legacy uses for preloading. */
export function slowConnection() {
  if (typeof navigator === "undefined") return false;
  const connection = (
    navigator as Navigator & { connection?: NetworkInformation }
  ).connection;
  return Boolean(
    connection?.saveData || /(^|-)[23]g$/.test(connection?.effectiveType ?? ""),
  );
}
