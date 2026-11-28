const TAG = "TAG_VALUE";
const FILE_KEY = "FILE_KEY_VALUE";
const PAGE_ID = "PAGE_ID_VALUE";
const ROOT_ID = "";

const want = String(TAG || "").trim();
if (!want) {
  return { error: "tag missing" };
}
if (!FILE_KEY) {
  return { error: "file key missing" };
}
if (!PAGE_ID) {
  return { error: "page id missing" };
}

const page = figma.root.children.find((item) => item.id === PAGE_ID);
if (!page) {
  return { error: "page missing", pageId: PAGE_ID };
}
await figma.setCurrentPageAsync(page);

const rootToken = String(ROOT_ID || "").trim();
let scope = page;
if (rootToken) {
  const node = await figma.getNodeByIdAsync(rootToken);
  if (!node || typeof node.findAll !== "function") {
    return { error: "root missing", rootId: rootToken };
  }
  scope = node;
}

function tagList(node) {
  let raw = "";
  try {
    raw = node.getSharedPluginData("icon_tagger", "tags") || "";
  } catch (error) {
    return [];
  }
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch (error) {
    // The plugin contract is a JSON array. A plain string is still a tag.
  }
  const single = String(raw).trim();
  return single ? [single] : [];
}

function readDate(target, names) {
  if (!target) {
    return null;
  }
  for (const key of names) {
    let value;
    try {
      value = target[key];
    } catch (error) {
      continue;
    }
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      const ms = value < 1e12 ? value * 1000 : value;
      try {
        return new Date(ms).toISOString();
      } catch (error) {
        return String(value);
      }
    }
  }
  return null;
}

function datesOf(node) {
  return {
    createdAt: readDate(node, ["createdAt", "created_at", "creationDate"]),
    updatedAt: readDate(node, ["updatedAt", "updated_at", "lastModified", "lastModifiedAt", "modifiedAt"]),
    editedAt: readDate(node, ["editedAt", "edited_at", "lastEdited", "lastEditedAt"]),
  };
}

function linkFor(id) {
  const nodeId = String(id).replace(/:/g, "-");
  return "https://www.figma.com/design/" + FILE_KEY + "/?node-id=" + nodeId;
}

const nodes = [scope].concat(scope.findAll(function () { return true; }));
const matches = [];
let total = 0;
for (const node of nodes) {
  const tags = tagList(node);
  if (!tags.includes(want)) {
    continue;
  }
  total += 1;
  if (matches.length >= 40) {
    continue;
  }
  const dates = datesOf(node);
  matches.push({
    id: node.id,
    name: node.name,
    type: node.type,
    tags: tags,
    link: linkFor(node.id),
    createdAt: dates.createdAt,
    updatedAt: dates.updatedAt,
    editedAt: dates.editedAt,
  });
}

let fileUpdatedAt = null;
try {
  fileUpdatedAt = readDate(figma, ["lastModified", "lastModifiedAt", "updatedAt"]);
} catch (error) {
  fileUpdatedAt = null;
}

return {
  fileKey: FILE_KEY,
  pageId: page.id,
  pageName: page.name,
  rootId: rootToken || page.id,
  scanned: nodes.length,
  total: total,
  truncated: total > matches.length,
  fileUpdatedAt: fileUpdatedAt,
  matches: matches,
};
