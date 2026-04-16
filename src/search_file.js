const vscode = require("vscode")
const fs = require('fs');
const xml2js = require('xml2js');
const path = require('path');

let projectConfiguration = new Array();
let globalProjectConfig = new Array();
async function findProjectFiles() {
    const pattern = '**/{.project,.cproject}';
    const files = await vscode.workspace.findFiles(pattern);
    return files.map(file => file.fsPath);
}

// 解析 .project 文件
/**
 * @param {fs.PathOrFileDescriptor} filePath
 * @param {string} projectName
 */
function parseProjectFile(filePath,projectName) {
    const xml = fs.readFileSync(filePath, 'utf8');
    xml2js.parseString(xml, (err, result) => {
        if (err) {
            console.error('解析 .project 文件出错:', err);
            return;
        }

        // 提取相关配置信息
        if(projectConfiguration[projectName] == undefined)
            projectConfiguration[projectName] = {};
        try{
            projectConfiguration[projectName]["name"] = result.projectDescription.name[0];
            projectConfiguration[projectName]["buildCommands"] = result.projectDescription.buildSpec[0].buildCommand.map(command => command.name[0]);    
        }
        catch (error)
        {
            // 可以在这里记录错误信息
            // console.error(`Error processing project ${projectName}:`, error);
            // 删除项目配置
            delete projectConfiguration[projectName];
        }

        // console.log('项目名称:', projectName);
        // console.log('构建命令:', buildCommands);
    });
}

// 解析 .cproject 文件
/**
 * @param {fs.PathOrFileDescriptor} filePath
 * @param {string} projectName
 */
function parseCProjectFile(filePath,projectName) {
    const xml = fs.readFileSync(filePath, 'utf8');
    xml2js.parseString(xml, (err, result) => {
        if (err) {
            console.error('解析 .cproject 文件出错:', err);
            return;
        }

        // 提取相关配置信息
        if(projectConfiguration[projectName] == undefined)
            projectConfiguration[projectName] = {};
        try{
            projectConfiguration[projectName]["configurations"] = result.cproject.storageModule.map(coreSettings => {
                if(coreSettings.$.moduleId == "org.eclipse.cdt.core.settings")
                    return coreSettings.cconfiguration;
            })[0]
            .map(config => {
                return {
                    name: config.storageModule[0].$.name,
                    // buildDir: config.$.buildDirectory,
                    toolChainId: config.storageModule[0].$.id,
                    buildSystemId: config.storageModule[0].$.buildSystemId,
                };
            });
        }
        catch(error)
        {
            // console.error(`Error processing project ${projectName}:`, error);
            delete projectConfiguration[projectName];
        }
        // console.log('构建配置:', configurations);
    });
}
function getProjectConfig()
{
	findProjectFiles().then(files => {
		if (files.length > 0) {
			// file_path = files;
			// console.log(file_path)
			// console.log(vscode.workspace.workspaceFolders)
            if (vscode.workspace.workspaceFolders == undefined) {
                return;
            }
			const workspaceFolder = vscode.workspace.workspaceFolders[0].uri.fsPath; // 假设只有一个工作区文件夹
			for (let index = 0; index < files.length; index++) {
				const directoryPath = path.dirname(path.relative(workspaceFolder, files[index]));
				// console.log(directoryPath);
				if (files[index].includes(".cproject") )
					parseCProjectFile(files[index],directoryPath)
				else if (files[index].includes(".project"))
					parseProjectFile(files[index],directoryPath)
			}
		} else {
			// file_path = [];
		}
        for (const key in projectConfiguration) {
            if (Object.prototype.hasOwnProperty.call(projectConfiguration, key)) {
                const element = projectConfiguration[key];
                let tempDict = { "projectName": key, "name": element.name, "buildCommands": element.buildCommands, "configurations": element.configurations }
                globalProjectConfig.push(tempDict)
            }
        }
		// console.log(globalProjectConfig)
	});
}

module.exports = {
    findProjectFiles,
    parseCProjectFile,
    parseProjectFile,
    getProjectConfig,
    globalProjectConfig,
}