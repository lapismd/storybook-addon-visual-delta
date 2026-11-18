import { isMap, parseDocument } from "yaml";

export const isMaintenanceNotePath = (path) =>
  /^\.changeset\/lapis-dependencies-[a-f0-9]{12}\.md$/u.test(path);

export function maintenanceNotePaths(files, changedFiles) {
  const paths = changedFiles.filter((path) => path.startsWith(".changeset/"));
  const fail = () => {
    throw Error(
      "Visual Delta canonical intake: invalid empty maintenance note",
    );
  };
  if (paths.length > 1) fail();
  for (const path of paths) {
    const text = files[path];
    if (
      !isMaintenanceNotePath(path) ||
      typeof text !== "string" ||
      Buffer.byteLength(text, "utf8") > 8192
    )
      fail();
    const lines = text.split(/\r?\n/u);
    const end = lines.indexOf("---", 1);
    if (
      lines[0] !== "---" ||
      end < 1 ||
      !lines
        .slice(end + 1)
        .join("\n")
        .trim()
    )
      fail();
    const header = lines.slice(1, end).join("\n");
    const document = parseDocument(header);
    if (
      document.errors.length ||
      document.warnings.length ||
      (header.trim() &&
        (!isMap(document.contents) || document.contents.items.length))
    )
      fail();
  }
  return paths;
}
