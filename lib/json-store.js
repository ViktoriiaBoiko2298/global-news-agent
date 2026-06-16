import fs from "fs/promises";
import path from "path";

export async function readJsonOr(filePath, fallbackValue) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    try {
      return JSON.parse(raw);
    } catch (error) {
      const backupPath = `${filePath}.corrupt.${Date.now()}`;
      await fs.rename(filePath, backupPath).catch(() => {});
      console.warn(`Invalid JSON in ${filePath}. Backed up to ${backupPath}.`, error);
      return fallbackValue;
    }
  } catch (error) {
    if (error?.code === "ENOENT") return fallbackValue;
    throw error;
  }
}

export async function writeJsonAtomic(filePath, value) {
  const dir = path.dirname(filePath);
  const tempPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(tempPath, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tempPath, filePath);
}
