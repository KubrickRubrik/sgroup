const FILE_KEY = "FILE_KEY_VALUE";
const PAGE_ID = "PAGE_ID_VALUE";
const ROOT_ID = "";

if (!FILE_KEY) {
  return { error: "file key missing" };
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

function linkFor(id) {
  const nodeId = String(id).replace(/:/g, "-");
  return "https://www.figma.com/design/" + FILE_KEY + "/?node-id=" + nodeId;
}

const pageId = String(PAGE_ID || "").trim();
if (!pageId) {
  const pages = figma.root.children.map((page) => ({ id: page.id, name: page.name }));
  return { fileKey: FILE_KEY, fileName: figma.root.name, pages };
}

const page = figma.root.children.find((item) => item.id === pageId);
if (!page) {
  return { error: "page missing", pageId: pageId };
}
await figma.setCurrentPageAsync(page);

const rootToken = String(ROOT_ID || "").trim();
let scope = page;
if (rootToken) {
  const node = await figma.getNodeByIdAsync(rootToken);
  if (!node) {
    return { error: "root missing", rootId: rootToken };
  }
  scope = node;
}

const nodes = typeof scope.findAll === "function"
  ? [scope].concat(scope.findAll(function () { return true; }))
  : [scope];

const found = [];
for (const node of nodes) {
  const tags = tagList(node);
  if (!tags.length) {
    continue;
  }
  found.push({
    id: node.id,
    name: node.name,
    type: node.type,
    tags: tags,
    link: linkFor(node.id),
  });
}

return {
  fileKey: FILE_KEY,
  pageId: page.id,
  pageName: page.name,
  rootId: rootToken || page.id,
  scanned: nodes.length,
  nodes: found,
};
