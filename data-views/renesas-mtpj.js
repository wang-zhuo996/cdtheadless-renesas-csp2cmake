const vscode = require("vscode");
const fs = require("fs");
const xml2js = require("xml2js");
const path = require("path");

// ─────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────
let globalMtpjConfig = []; // { name, projectName, filePath, buildModes[], currentBuildMode }
let currentProject = null; // currently selected project (for Config view)
let buildModeProvider; // RenesasBuildModeTreeDataProvider instance

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** Decode a Base64 string safely */
function base64Decode(str) {
  try {
    return Buffer.from(str, "base64").toString("utf8");
  } catch {
    return str;
  }
}

/** Find all .mtpj files in the workspace */
async function findMtpjFiles() {
  const pattern = "**/*.mtpj";
  const files = await vscode.workspace.findFiles(pattern);
  return files.map((f) => f.fsPath);
}

/** Parse a .mtpj file and return structured data */
function parseMtpjFile(filePath) {
  try {
    const xml = fs.readFileSync(filePath, "utf8");
    let result = {};
    xml2js.parseString(xml, (err, parsed) => {
      if (err) {
        console.error("parseMtpj parse error:", err);
        return;
      }
      result = parsed;
    });

    const classes = result?.CubeSuiteProject?.Class || [];
    const matched_class = classes.find((cls) => {
      if (cls.$.Guid === "eb3b4b69-af1a-4dc1-b2bc-4b81a50fb2a4") {
        return cls.Instance;
      }
    });
    const instance = matched_class?.Instance.find((inst) => {
      if (inst.$.Guid === "eb3b4b69-af1a-4dc1-b2bc-4b81a50fb2a4") {
        return inst;
      }
    });
    if (!instance) return null;

    const buildModeCount = parseInt(instance.BuildModeCount?.[0] ?? "0", 10);
    const currentBuildModeRaw = instance.CurrentBuildMode?.[0] ?? "";

    // Collect build modes
    const buildModes = [];
    for (let i = 0; i < buildModeCount; i++) {
      const encoded = instance[`BuildMode${i}`]?.[0] ?? "";
      buildModes.push({
        name: base64Decode(encoded).replaceAll("\x00", ""),
        encoded,
        index: i,
      });
    }

    // // Current build mode name (decode)
    const currentBuildMode = currentBuildModeRaw;

    // Source items
    const sourceItemCount = parseInt(instance.SourceItemCount?.[0] ?? "0", 10);
    const sourceItems = [];
    for (let i = 0; i < sourceItemCount; i++) {
      sourceItems.push({
        guid: instance[`SourceItemGuid${i}`]?.[0] ?? "",
        type: instance[`SourceItemType${i}`]?.[0] ?? "",
      });
    }

    const projectName = path.basename(filePath, ".mtpj");

    return {
      name: projectName,
      projectName,
      filePath,
      buildModes,
      currentBuildMode,
      sourceItemCount,
      sourceItems,
      buildModeCount,
      matched_class
    };
  } catch (err) {
    console.error("parseMtpj error:", err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// TreeItem classes
// ─────────────────────────────────────────────────────────────
const Collapsed = vscode.TreeItemCollapsibleState.Collapsed;
const Expanded = vscode.TreeItemCollapsibleState.Expanded;
const NoCollapsed = vscode.TreeItemCollapsibleState.None;

class RenesasProjectItem extends vscode.TreeItem {
  /**
   * @param {object} data  parsed mtpj data
   * @param {string} [tooltipSuffix]  extra tooltip text
   */
  constructor(data, tooltipSuffix = "") {
    super(data.name, Collapsed);
    this.data = data;
    this.contextValue = "hasChildren";
    this.tooltip = [
      `📁 ${data.name}.mtpj`,
      `   Build Modes: ${data.buildModeCount}`,
      `   Current: ${data.currentBuildMode}`,
      tooltipSuffix,
    ]
      .filter(Boolean)
      .join("\n");
    this.description = data.currentBuildMode;
    this.iconPath = new vscode.ThemeIcon("symbol-folder");
  }
}

class RenesasBuildModeItem extends vscode.TreeItem {
  /**
   * @param {object} mode  { name, encoded, index }
   * @param {string} projectName
   */
  constructor(mode, projectName) {
    super(mode.name, NoCollapsed);
    this.mode = mode;
    this.projectName = projectName;
    this.contextValue = "buildModeItem";
    this.tooltip = `Build Mode: ${mode.name}`;
    this.description = `(#${mode.index + 1})`;
    this.iconPath = new vscode.ThemeIcon("wrench");
  }
}

class RenesasSourceItem extends vscode.TreeItem {
  /**
   * @param {object} src  { guid, type }
   */
  constructor(src) {
    super(src.guid, NoCollapsed);
    this.src = src;
    this.contextValue = "sourceItem";
    this.tooltip = `Type: ${src.type}`;
    this.description = src.type;
    this.iconPath = new vscode.ThemeIcon("file");
  }
}

// ─────────────────────────────────────────────────────────────
// RenesasCSP2CMake — project list view
// ─────────────────────────────────────────────────────────────
class RenesasProjectTreeDataProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  getTreeItem(element) {
    return element;
  }

  getChildren(element) {
    if (element) {
      // Second level: build modes
      if (element instanceof RenesasProjectItem) {
        const items = element.data.buildModes.map(
          (m) => new RenesasBuildModeItem(m, element.data.name),
        );
        return items;
      }
      return [];
    }
    // Root: return project list
    return globalMtpjConfig.map((p) => new RenesasProjectItem(p));
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }
}

// ─────────────────────────────────────────────────────────────
// RenesasCSP2CMakeConfig — build mode config view
// Shows build modes for the currently active project
// ─────────────────────────────────────────────────────────────
class RenesasBuildModeTreeDataProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  getTreeItem(element) {
    return element;
  }

  getChildren(element) {
    if (!currentProject) return [];

    if (element instanceof RenesasProjectItem) {
      // Second level: build modes
      return element.data.buildModes.map(
        (m) => new RenesasBuildModeItem(m, element.data.name),
      );
    }

    if (element instanceof RenesasBuildModeItem) {
      // Third level: source items of the current project
      return currentProject.sourceItems.map((s) => new RenesasSourceItem(s));
    }

    if (!element) {
      // Root: single node for the current project
      const result = [];
      for (const proj of globalMtpjConfig) {
        result.push(new RenesasProjectItem(proj));
      }
      return result;
    }

    return [];
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }
}

// ─────────────────────────────────────────────────────────────
// Refresh / scan logic
// ─────────────────────────────────────────────────────────────
async function refreshAll() {
  globalMtpjConfig = [];
  const files = await findMtpjFiles();
  for (const fp of files) {
    const data = parseMtpjFile(fp);
    if (data) globalMtpjConfig.push(data);
  }
  console.log(
    "[RenesasMtpj] Scanned projects:",
    globalMtpjConfig.map((p) => p.name),
  );

  // Auto-select first project if none selected
  if (!currentProject && globalMtpjConfig.length > 0) {
    globalMtpjConfig.sort((a, b) => a.name.localeCompare(b.name)); // sort alphabetically
    currentProject = globalMtpjConfig[0];
  }

  if (buildModeProvider) buildModeProvider.refresh();
  return globalMtpjConfig;
}

// ─────────────────────────────────────────────────────────────
// Commands
// ─────────────────────────────────────────────────────────────

/** Build the selected project using the current build mode */
const buildProject = (element) => {
  if (!element || !(element instanceof RenesasBuildModeItem)) {
    vscode.window.showWarningMessage(
      "请先在 Renesas CSP2CMake 视图中选择一个项目节点",
    );
    return;
  }
  const data = element;
  vscode.window.showInformationMessage(
    `[Renesas Build] ${data.projectName}.mtpj  Current Build Mode: ${data.label}`,
  );
  // TODO: wire up actual build command (CS+ headless invocation)
  console.log(
    "[Renesas Build] Triggered for:",
    data.name,
    "mode:",
    data.currentBuildMode,
  );
};

/** Refresh the Renesas tree views */
const refreshEntry = async () => {
  await refreshAll();
  vscode.window.showInformationMessage("[Renesas CSP2CMake] 已刷新");
};

/** Set current project for Config view */
const setCurrentProject = (element) => {
  if (element instanceof RenesasProjectItem) {
    currentProject = element.data;
    if (buildModeProvider) buildModeProvider.refresh();
    vscode.window.showInformationMessage(`已切换到项目: ${element.data.name}`);
  }
};

// ─────────────────────────────────────────────────────────────
// Provider instances (exported so extension.js can register them)
// ─────────────────────────────────────────────────────────────
const projectProvider = new RenesasProjectTreeDataProvider();
buildModeProvider = new RenesasBuildModeTreeDataProvider();

module.exports = {
  // State
  globalMtpjConfig,
  currentProject,
  // Providers
  RenesasProjectTreeDataProvider,
  RenesasBuildModeTreeDataProvider,
  projectProvider,
  buildModeProvider,
  // Classes (exposed for instanceof checks)
  RenesasProjectItem,
  RenesasBuildModeItem,
  RenesasSourceItem,
  // Commands
  buildProject,
  refreshEntry,
  setCurrentProject,
  // API
  refreshAll,
  parseMtpjFile,
  findMtpjFiles,
};
