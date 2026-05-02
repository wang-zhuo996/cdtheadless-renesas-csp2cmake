const vscode = require("vscode");
const ejs = require("ejs");
const fs = require("fs");
const path = require("path");
const mtpj2cli = require("./mtpj2cli_parse.json");
const cli_maker = require("./renesas-cli-maker");

const cli_maker_map = cli_maker.cli_maker;
const DEFAULT_CCRH_PATH = "C:/Program Files (x86)/Renesas Electronics/CS+/CC/CC-RH";

let extensionContext = null;

function setContext(context) {
  extensionContext = context;
}
function getContext() {
  return extensionContext;
}


function replaceVars(str, variables) {
  return str.replace("\n", "").replace(/%([^%]+)%/g, (match, varName) => {
    return variables[varName] !== undefined ? variables[varName] : match;
  });
}

class RenesasOptionFilter {
  constructor(type) {
    this.rules = mtpj2cli;
    this.type = type;
    this.map = {
      C编译选项: "Compile",
      Asm编译选项: "Assemble",
      链接选项: "Link",
      输出选项: "Hexoutput",
      Lib选项: "Library",
    };
  }
  matchOption(option, xml, idx, env) {
    const options = this.rules[this.map[this.type]];
    const keys = Object.keys(options);
    for (const key of keys) {
      let option_value = {};
      const op = key + "-" + idx;
      if (xml[op] !== undefined) {
        const value = xml[op];
        const rule = options[key];
        if (rule.type === "boolean") {
          if (value[0] === "True") {
            option_value[rule.arg] = true;
          } else {
            option_value[rule.arg] = false;
          }
        } else if (rule.type === "string") {
          if (rule.rule === "lowercase") {
            option_value[rule.arg] = replaceVars(value[0].toLowerCase(), env);
          } else option_value[rule.arg] = replaceVars(value[0], env);
        } else if (rule.type === "list") {
          option_value[rule.arg] = value[0]
            .replaceAll("\\", "/")
            .split("\r")
            .map((x) => replaceVars(x, env));
        } else if (rule.type === "string-env") {
          option_value[rule.arg] = replaceVars(value[0], env).replaceAll("\\", "/");
        }
      }
      // console.log(key,option_value);
      option.set(options[key].cli_option, option_value);
    }
    // console.log(option);
    return option;
  }
}

class RenesasMtpjParser {
  constructor() {
    this.projectTypeMap = {
      lib: ["C编译选项", "Asm编译选项", "Lib选项"],
      exe: ["C编译选项", "Asm编译选项", "链接选项", "输出选项"],
    };
    this.cli_maker = cli_maker_map;
    this.data_dict = {
      C编译选项: [
        "989d6783-59a0-4525-8ee4-a067fda90fe2",
        "24e7db6c-6f3c-483e-b3af-c4be92050d3b",
      ],
      Asm编译选项: ["55f70bbd-5f8f-404f-854e-5da727c86621"],
      链接选项: ["82d7e767-9e1b-43e5-a62d-4a892fa42000"],
      输出选项: ["cd7ca0dd-4e03-43a0-b849-b72bd0bf0bd1"],
      Lib选项: ["625fdef6-79e0-476f-ae26-6cde275afb59"],
    };
  }

  setEnv(data) {
    const configers = vscode.workspace.getConfiguration("renesas");
    let microToolPath = "";
    if (configers) {
      microToolPath = configers.get("ccrh_toolchain_path");
    }
    const system_env = process.env;
    this.env = {};
    this.env["ActiveProjectDir"] = path.dirname(data.filePath).replaceAll("\\", "/");
    this.env["ActiveProjectMicomName"] = data.micro_type;
    this.env["ActiveProjectName"] = data.projectName;
    this.env["BuildModeName"] = data.currentBuildMode;
    this.env["MainProjectDir"] = path.dirname(data.filePath).replaceAll("\\", "/");
    this.env["MainProjectMicomName"] = data.micro_type;
    this.env["MainProjectName"] = data.projectName;
    this.env["MicomToolPath"] = microToolPath;
    this.env["ProjectDir"] = path.dirname(data.filePath).replaceAll("\\", "/");
    this.env["ProjectMicomName"] = data.micro_type;
    this.env["ProjectName"] = data.projectName;
    this.env["TempDir"] = system_env.TEMP;
    this.env["WinDir"] = system_env.SystemRoot + "\\system32";
    this.env["ResetVectorPE1"] = "0"; //data.resetVectorPE1;
    Object.assign(this.env, system_env);
  }

  clear() {
    for (const value of Object.values(this.cli_maker)) {
      value.clear();
    }
  }

  async parseMtpjXmlObj(data) {
    this.data = data;
    this.clear();
    this.setEnv(data);
    this.currentBuildModeIndex = data.currentBuildModeIndex;
    this.projectType = data.projectType;
    function filter_data(data, guid) {
      return data.filter((d) => guid.find((i) => i === d.$?.Guid));
    }
    this.option_filted = [];

    for (const item of this.projectTypeMap[data.projectType]) {
      this.option_filted.push(
        new RenesasOptionFilter(item).matchOption(
          this.cli_maker[item],
          Object.assign(
            {},
            ...filter_data(data.matched_class.Instance, this.data_dict[item]),
          ),
          this.currentBuildModeIndex,
          this.env,
        ),
      );
    }
    const configers = vscode.workspace.getConfiguration("renesas");
    this.last_version = Object.assign({}, ...this.cli_maker["C编译选项"].get("-V").input_args)["version"];
    const { version, toolchainPath } = this._detectVersion(configers);
    this.version = version;

    for (const item of this.projectTypeMap[data.projectType]) {
      this.cli_maker[item].setVersion(this.version);
    }
    for (const item of this.option_filted) {
      item.filter_options();
    }
    configers.update("ccrh_toolchain_path", toolchainPath, vscode.ConfigurationTarget.Global);
  }

  _detectVersion(configers) {
    const lastCompilerInputs = Object.assign({}, ...this.cli_maker["C编译选项"].get("-V").input_args);
    const lastVersion = lastCompilerInputs["version"] || "";
    const lastCompilerPath = path.normalize((lastCompilerInputs["path"]?.[1] || "") + '../');
    const vscodeConfigPath = path.normalize(configers.get("ccrh_toolchain_path") || "");

    let toolchainPath = path.normalize(DEFAULT_CCRH_PATH);
    if (!fs.existsSync(toolchainPath)) {
      if (fs.existsSync(lastCompilerPath)) {
        toolchainPath = lastCompilerPath;
      } else if (fs.existsSync(vscodeConfigPath)) {
        toolchainPath = vscodeConfigPath;
      }
    }

    const versionList = fs.readdirSync(toolchainPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory() && dirent.name.startsWith("V"))
      .map(dirent => dirent.name);

    let version = lastVersion;
    if (versionList.includes(lastVersion)) {
      version = lastVersion;
    } else {
      const lastParts = lastVersion.replace("V", "").split(".").map(Number);
      for (const candidate of versionList) {
        const candidateParts = candidate.replace("V", "").split(".").map(Number);
        for (let i = 0; i < candidateParts.length; i++) {
          if (candidateParts[i] > (lastParts[i] || 0)) {
            version = candidate;
            break;
          } else if (candidateParts[i] < (lastParts[i] || 0)) {
            break;
          }
        }
        if (version === candidate) break;
      }
    }

    return { version, toolchainPath };
  }

  async generateCmakeCli() {
    const configers = vscode.workspace.getConfiguration("renesas");
    const float_mode = this.cli_maker["C编译选项"].fpu_flag();
    const ccrh_toolchain_path = path.normalize(
      `${configers.get("ccrh_toolchain_path")}/${this.version}/bin`,
    ).replaceAll("\\", "/");
    const options = {
      C编译选项: [],
      Asm编译选项: [],
      链接选项: [],
      输出选项: [],
      Lib选项: [],
    };

    for (const item of this.projectTypeMap[this.projectType]) {
      for (const key of this.cli_maker[item].activet_options) {
        const value = this.cli_maker[item].options.get(key);
        if (item === "C编译选项" && key === "-I") continue;
        if (item === "Asm编译选项" && key === "-I") continue;
        options[item].push(value.compileOptionOutputCli());
      }
    }
    const csp_prj_root_path = this.env["ActiveProjectDir"];
    const c_compiler_options = options["C编译选项"].join(" ");
    const asm_compiler_options = options["Asm编译选项"].join(" ");
    const link_options = options["链接选项"].join(" ");
    const output_options = options["输出选项"].join(" ");
    const lib_options = options["Lib选项"].join(" ");
    const include_path_list = Object.assign(
      {},
      ...this.cli_maker["C编译选项"].options.get("-I").input_args,
    )["dir"];
    let include_path = "";
    if (include_path_list.length === 0) {
      include_path = "";
    } else {
      include_path = "    ${CSP_PROJECT_ROOT_PATH}/" + include_path_list.map((item) => item.replaceAll("\\", "/")).join("\n    ${CSP_PROJECT_ROOT_PATH}/");;
      // include_path =
      //   "    ${CMAKE_SOURCE_DIR}/" +
      //   include_path_list.join("\n    ${CMAKE_SOURCE_DIR}/");
    }

    const { all_files, asm_files } = this._buildOrderedFileList();

    const ejs_value = {
      csp_prj_root_path,
      c_compiler_options,
      asm_compiler_options,
      link_options,
      output_options,
      lib_options,
      include_path,
      ccrh_toolchain_path,
      float_mode,
      all_files,
      asm_files
    };
    this._renderTemplates(ejs_value);
    const cmake_configers = vscode.workspace.getConfiguration("cmake");

    cmake_configers.update("configureSettings", {
      "CMAKE_TOOLCHAIN_FILE": "${workspaceFolder}/cmake/cross.cmake",
      "CMAKE_TOOLS_FOLDER": "${command:renesas.utilities.folder}/tools",
    })
    cmake_configers.update("sourceDirectory", "${workspaceFolder}");
    cmake_configers.update("preferredGenerators", [
      "Ninja",
      "MinGW Makefiles",
      "Unix Makefiles"
    ]);
    cmake_configers.update("configureOnOpen", true);
  }

  _buildOrderedFileList() {
    const instanceData = this.data.matched_class.Instance;
    const fileTree = this.data.file_tree;
    const executeFiles = this.data.excute_files;

    const filesByTime = {};
    Object.keys(executeFiles).forEach((key) => {
      const fileData = instanceData.find((item) => item.$.Guid === key);
      const addTime = fileData.ItemAddTime[0];
      const addTimeCount = parseInt(fileData.ItemAddTimeCount[0]);
      filesByTime[addTime] = Object.assign([],
        { [addTimeCount]: key },
        (filesByTime[addTime] || []));
    });

    const orderedNames = [];
    Object.keys(filesByTime).sort().forEach((timeKey) => {
      for (let i = 0; i < filesByTime[timeKey].length; i++) {
        const guid = filesByTime[timeKey][i];
        if (guid !== undefined && (guid.length ?? 0) === 36) {
          orderedNames.push(fileTree.files[guid]);
        } else if (guid !== undefined) {
          console.debug("文件guid异常", guid, "对应的添加时间为", timeKey);
        }
      }
    });

    const prefix = "    ${CSP_PROJECT_ROOT_PATH}/";
    const allFiles = prefix + orderedNames
      .map(item => item.replaceAll("\\", "/"))
      .join("\n" + prefix);

    const asmFiles = prefix + Object.values(fileTree.files)
      .map(item => item.replaceAll("\\", "/"))
      .filter(item => item.endsWith(".asm"))
      .join("\n" + prefix);

    return { all_files: allFiles, asm_files: asmFiles };
  }

  _renderTemplates(ejsValue) {
    const fileList = [
      "CMakeLists.txt",
      "cmake/cross.cmake",
      "cmake/Config.cmake",
      "cmake/GeneratedCfg.cmake",
      "cmake/GeneratedSrc.cmake",
    ];

    const templateRoot = path.join(getContext().extensionPath, "data-views", "template");
    const workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;

    for (const file of fileList) {
      const outputPath = path.join(workspacePath, file);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      const template = fs.readFileSync(path.join(templateRoot, file), "utf-8");
      if (template) {
        fs.writeFileSync(outputPath, ejs.render(template, ejsValue));
      }
    }
  }
}

module.exports = {
  RenesasMtpjParser,
  setContext,
  getContext,
};
