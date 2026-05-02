const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const { Collapsed, None: NoCollapsed } = vscode.TreeItemCollapsibleState;

class CdtProjectTreeProvider {
    constructor(projects) {
        this.projects = projects || [];
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }

    getTreeItem(element) {
        return element;
    }

    getChildren(element) {
        if (element) {
            return element.children || [];
        }
        return this.projects.map(project => {
            const children = project.configurations.map(
                config => new CdtProjectTreeItem(config.name, "", [])
            );
            return new CdtProjectTreeItem(project.name, project.projectName, children);
        });
    }

    getParent(element) {
        return element.parent || null;
    }

    refresh() {
        this._onDidChangeTreeData.fire();
    }

    setProjects(projects) {
        this.projects = projects;
        this.refresh();
    }
}

class CdtProjectTreeItem extends vscode.TreeItem {
    constructor(label, description, children) {
        const hasChildren = children && children.length > 0;
        super(label, hasChildren ? Collapsed : NoCollapsed);
        this.tooltip = `${label}`;
        this.description = description ? `${description}` : "";
        this.children = children;
        this.contextValue = hasChildren ? "hasChildren" : "";
        for (const child of this.children) {
            child.parent = this;
        }
        this.parent = undefined;
    }
}

function executeBuildCommand(element) {
    if (!element.parent) {
        vscode.window.showErrorMessage("您正在尝试对一个无父节点进行单配置编译操作!");
        return;
    }

    const globalConfig = vscode.workspace.getConfiguration("cdtheadlessbuild");
    const launchPath = globalConfig.get("launchPath", "");
    if (!launchPath) {
        vscode.window.showErrorMessage("您没有设置launchPath!");
        return;
    }

    const workspaceFolder = element.parent.description === '.'
        ? "../.vscode/cdtheadlessbuild/Default_WorkSpace"
        : `./.vscode/cdtheadlessbuild/${element.parent.description}_WorkSpace`;

    ensureDirectory(workspaceFolder);

    const command = `${launchPath} --launcher.suppressErrors -nosplash -application org.eclipse.cdt.managedbuilder.core.headlessbuild -data ${workspaceFolder} -import ${element.parent.description} -build ${element.parent.label}/${element.label}`;

    let terminal = vscode.window.createTerminal("cdt-headless-build");
    terminal.show();
    terminal.sendText(command);
}

function ensureDirectory(dirPath) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showErrorMessage('No workspace folder is open.');
        return;
    }
    const fullPath = path.join(workspaceFolders[0].uri.fsPath, dirPath);
    if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
        console.log(`Directory ${dirPath} created successfully.`);
    }
}

module.exports = {
    CdtProjectTreeProvider,
    executeBuildCommand,
};
