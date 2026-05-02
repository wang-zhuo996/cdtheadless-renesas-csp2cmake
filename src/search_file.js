const vscode = require("vscode");
const fs = require('fs');
const xml2js = require('xml2js');
const path = require('path');

async function findProjectFiles() {
    const pattern = '**/{.project,.cproject}';
    const files = await vscode.workspace.findFiles(pattern);
    return files.map(file => file.fsPath);
}

async function getProjectConfig() {
    const files = await findProjectFiles();
    if (files.length === 0) return [];

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return [];

    const workspaceFolder = workspaceFolders[0].uri.fsPath;
    const projectMap = {};

    for (const filePath of files) {
        const dirPath = path.relative(workspaceFolder, path.dirname(filePath));
        if (!projectMap[dirPath]) projectMap[dirPath] = {};

        try {
            const xml = fs.readFileSync(filePath, 'utf8');
            const result = await xml2js.parseStringPromise(xml);

            if (filePath.includes('.cproject')) {
                const storageModule = result?.cproject?.storageModule?.find(
                    sm => sm.$?.moduleId === "org.eclipse.cdt.core.settings"
                );
                if (storageModule?.cconfiguration) {
                    projectMap[dirPath].configurations = storageModule.cconfiguration.map(config => ({
                        name: config.storageModule[0].$.name,
                        toolChainId: config.storageModule[0].$.id,
                        buildSystemId: config.storageModule[0].$.buildSystemId,
                    }));
                }
            } else if (filePath.includes('.project')) {
                const desc = result?.projectDescription;
                if (desc) {
                    projectMap[dirPath].name = desc.name[0];
                    projectMap[dirPath].buildCommands = desc.buildSpec[0].buildCommand.map(cmd => cmd.name[0]);
                }
            }
        } catch (err) {
            console.error(`Error parsing ${filePath}:`, err);
        }
    }

    const configs = [];
    for (const [projectName, data] of Object.entries(projectMap)) {
        if (data.name) {
            configs.push({
                projectName,
                name: data.name,
                buildCommands: data.buildCommands || [],
                configurations: data.configurations || [],
            });
        }
    }

    return configs;
}

module.exports = {
    findProjectFiles,
    getProjectConfig,
};
