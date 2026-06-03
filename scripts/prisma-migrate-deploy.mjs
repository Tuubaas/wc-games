import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const env = { ...readDotEnv(".env"), ...process.env };

if (env.DIRECT_URL) {
  env.DATABASE_URL = env.DIRECT_URL;
}

const result = spawnSync("prisma", ["migrate", "deploy"], {
  env,
  shell: process.platform === "win32",
  stdio: "inherit"
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if (result.signal) {
  process.kill(process.pid, result.signal);
}

process.exit(result.status ?? 1);

function readDotEnv(path) {
  try {
    return readFileSync(path, "utf8")
      .split(/\r?\n/)
      .reduce((values, line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return values;

        const separator = trimmed.indexOf("=");
        if (separator === -1) return values;

        const key = trimmed.slice(0, separator).trim();
        const rawValue = trimmed.slice(separator + 1).trim();
        const quote = rawValue[0];
        const value =
          (quote === "\"" || quote === "'") && rawValue.endsWith(quote)
            ? rawValue.slice(1, -1)
            : rawValue;

        values[key] = value;
        return values;
      }, {});
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}
