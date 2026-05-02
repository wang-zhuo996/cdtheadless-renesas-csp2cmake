const vscode = require("vscode");

const { setContext } = require('./data-views/renesas-cli-parse');
const { CdtProjectTreeProvider, executeBuildCommand } = require("./data-views/nodeDependencies");
const search_file = require("./src/search_file");
const renesasMtpj = require("./data-views/renesas-mtpj");
const { reformatSRecordFile, reformatSRecordFileInDocument } = require("./data-views/srecord_reformat");

/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
    console.log('Congratulations, your extension "cdtheadlessbuild" is now active!');

    setContext(context);

    // ── Eclipse CDT ──────────────────────────────────────────
    const cdtProjects = await search_file.getProjectConfig();
    const cdtProvider = new CdtProjectTreeProvider(cdtProjects);

    context.subscriptions.push(
        vscode.window.registerTreeDataProvider("SearchedProjectTree", cdtProvider),
        vscode.commands.registerCommand("SearchedProjectTree.refreshEntry", () =>
            cdtProvider.refresh()
        ),
        vscode.commands.registerCommand("SearchedProjectTree.buildProject", executeBuildCommand),
        vscode.commands.registerCommand("SearchedProjectTree.buildAllProject", (element) => {
            vscode.window.showInformationMessage("buildAllProject is waiting implementation");
            console.log(element);
        }),
    );

    // ── Renesas CSP2CMake ────────────────────────────────────
    const {
        projectProvider,
        buildModeProvider,
        buildProject,
        refreshEntry,
        setCurrentProject,
    } = renesasMtpj;

    context.subscriptions.push(
        vscode.window.registerTreeDataProvider("RenesasCSP2CMakeConfig", projectProvider),
        vscode.window.registerTreeDataProvider("RenesasCSP2CMake", buildModeProvider),
        vscode.commands.registerCommand("RenesasCSP2CMake.refreshEntry", refreshEntry),
        vscode.commands.registerCommand("RenesasCSP2CMake.buildProject", buildProject),
        vscode.commands.registerCommand("RenesasCSP2CMake.setCurrentProject", setCurrentProject),
        vscode.commands.registerCommand("Srecord.reformat", reformatSRecordFile),
        vscode.commands.registerCommand("Srecord.reformatinline", reformatSRecordFileInDocument),
    );

    // Initial scan
    try {
        await renesasMtpj.refreshAll();
    } catch (err) {
        console.error("[Renesas CSP2CMake] Activation error:", err);
    }
}

function deactivate() {}

module.exports = {
    activate,
    deactivate,
};
