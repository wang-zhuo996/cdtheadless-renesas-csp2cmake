const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const readline = require('readline');

function resolveVariables(str, varEnv) {
    return str.replace(/\$\{(\w+)\}/g, (match, varName) => {
        return varEnv[varName] || match;
    });
}

async function reformatSRecordFile(filePath) {
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `Reformatting ${path.basename(filePath.fsPath)} file...`,
            cancellable: true,
        },
        async (progress, token) => {
            token.onCancellationRequested(() => {
                console.log("User canceled the long running operation");
            });


            const sRecordReformat = new SRecordReformat(filePath.fsPath, progress, token);
            await sRecordReformat.reformatSRecordFile();
            await sRecordReformat.generateNewSRecords(false);

            vscode.window.showInformationMessage("reformatted successfully!");
        }
    )
}

async function reformatSRecordFileInDocument(filePath) {
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `Reformatting ${path.basename(filePath.fsPath)} file in document...`,
            cancellable: true,
        },
        async (progress, token) => {
            token.onCancellationRequested(() => {
                console.log("User canceled the long running operation");
            });

            const sRecordReformat = new SRecordReformat(filePath.fsPath, progress, token);
            await sRecordReformat.reformatSRecordFile();
            await sRecordReformat.generateNewSRecords(true);

            vscode.window.showInformationMessage("reformatted successfully!");
        }
    )
}

class SRecordReformat {
    constructor(filePath, process = null, token = null) {
        this.filePath = filePath;
        this.process = process;
        this.token = token;
        this.var_env = {};
        this.setVariable();
        const cfg = vscode.workspace.getConfiguration('srecordReformat');
        this.seg_data_format = cfg.get('segDataFormat', 'S2');
        this.seg_data_length = cfg.get('segDataLength', 16);
        this.seg_data_fill = cfg.get('segDataFill', 0);
        this.seg_data_min_interval = cfg.get('segDataMinInterval', 200);
        this.reformat_file_format = cfg.get('reformatFileFormat',
            '${fileDirname}/${fileBasenameNoExtension}_reformatted${fileExtname}');
        this.reformat_file_format = this.resolveVars(this.reformat_file_format);

        this.dataMap = new Map();
        this.lastSegment = null;
        this.s0Record = null;
        this.endRecord = null;
    }

    resolveVars(str) {
        return resolveVariables(str, this.var_env);
    }

    setVariable() {
        this.var_env['workspaceFolder'] = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
        this.var_env['file'] = this.filePath;
        this.var_env['fileBasename'] = path.basename(this.filePath);
        this.var_env['fileBasenameNoExtension'] = path.parse(this.filePath).name;
        this.var_env['fileExtname'] = path.extname(this.filePath);
        this.var_env['fileDirname'] = path.dirname(this.filePath);
    }

    check_report(msg, increment = 0) {
        if (!(this.process && this.token)) return;

        if (this.token.isCancellationRequested) {
            vscode.window.showInformationMessage("User canceled")
            return;
        }
        if (msg && increment) {
            this.process.report({ message: msg, increment: increment });
        }
    }

    async reformatSRecordFile() {
        const rl = readline.createInterface({
            input: fs.createReadStream(this.filePath),
            crlfDelay: Infinity
        });
        this.check_report('正在解析文件...');
        for await (const line of rl) {
            if (!line.startsWith('S')) continue;
            const record = this.parseSRecord(line);
            if (!record || !record.valid) continue;

            if (record.type === 'S0') {
                this.s0Record = record;
                continue;
            }
            if (['S7', 'S8', 'S9'].includes(record.type)) {
                this.endRecord = record;
                continue;
            }
            if (!['S1', 'S2', 'S3'].includes(record.type)) continue;

            const dataBuf = Buffer.from(record.data, 'hex');
            this.addDataSegment(record.address, dataBuf, record.data_length);
            this.check_report(null)
        }
    }

    addDataSegment(address, dataBuf, dataLen) {
        if (!this.lastSegment) {
            this.lastSegment = { start: address, end: address + dataLen, data: dataBuf, length: dataLen };
            this.dataMap.set(address, this.lastSegment);
            return;
        }

        if (address < this.lastSegment.end) {
            vscode.window.showErrorMessage(
                `数据重叠：地址 0x${address.toString(16)} 与上一个数据段结束地址 0x${this.lastSegment.end.toString(16)} 重叠。`);
            return;
        }

        if (address === this.lastSegment.end) {
            this.lastSegment.data = Buffer.concat([this.lastSegment.data, dataBuf]);
            this.lastSegment.end = address + dataLen;
            this.lastSegment.length += dataLen;
            return;
        }

        const gap = address - this.lastSegment.end;
        if (gap < this.seg_data_min_interval) {
            const fillBuf = Buffer.alloc(gap, this.seg_data_fill);
            this.lastSegment.data = Buffer.concat([this.lastSegment.data, fillBuf, dataBuf]);
            this.lastSegment.end = address + dataLen;
            this.lastSegment.length += gap + dataLen;
            return;
        }

        this.lastSegment = { start: address, end: address + dataLen, data: dataBuf, length: dataLen };
        this.dataMap.set(address, this.lastSegment);
    }

    formatSRecord(record) {
        return `${record.type}${record.length.toString(16).toUpperCase().padStart(2, '0')}${record.address.toString(16).toUpperCase().padStart(record.address_length * 2, '0')}${record.data}${record.checksum.toString(16).toUpperCase().padStart(2, '0')}`;
    }

    buildOutputLines() {
        const lines = [];
        if (this.s0Record) {
            lines.push(this.formatSRecord(this.s0Record));
        }
        const sortedAddresses = Array.from(this.dataMap.keys()).sort((a, b) => a - b);
        for (const addr of sortedAddresses) {
            this.check_report(`正在生成输出文件 ${sortedAddresses.indexOf(addr)}/${sortedAddresses.length}...`, 100 * sortedAddresses.indexOf(addr) / sortedAddresses.length);
            lines.push(...this.createSRecordLine(this.dataMap.get(addr)));
        }
        if (this.endRecord) {
            lines.push(this.formatSRecord(this.endRecord));
        } else {
            lines.push('S9030000FC');
        }
        return lines;
    }

    async generateNewSRecords(inDocument) {
        try {
            const lines = this.buildOutputLines();
            const content = lines.join('\n');

            this.check_report('正在写入文件...',99);
            if (inDocument) {
                const editor = vscode.window.activeTextEditor;
                if (!editor) return false;
                const firstLine = editor.document.lineAt(0);
                const lastLine = editor.document.lineAt(editor.document.lineCount - 1);
                const fullRange = new vscode.Range(firstLine.range.start, lastLine.range.end);
                await editor.edit((editBuilder) => {
                    editBuilder.replace(fullRange, content);
                });
                return true;
            }

            const writeStream = fs.createWriteStream(this.reformat_file_format);
            writeStream.write(content);
            writeStream.end();
            return true;
        } catch (err) {
            vscode.window.showErrorMessage(`生成新S-record文件失败：${err.message}`);
            return false;
        }
    }

    createSRecordLine(segment) {
        let type, addrBytes;
        switch (this.seg_data_format) {
            case 'S1': addrBytes = 2; type = 'S1'; break;
            case 'S2': addrBytes = 3; type = 'S2'; break;
            case 'S3': addrBytes = 4; type = 'S3'; break;
            default: throw new Error(`不支持的段数据格式：${this.seg_data_format}`);
        }

        const dataHex = segment.data.toString('hex').toUpperCase();
        const dataBytes = segment.length;
        const lines = [];

        for (let i = 0; i < dataBytes; i += this.seg_data_length) {
            const addrHex = (segment.start + i).toString(16).toUpperCase().padStart(addrBytes * 2, '0');
            const dataChunk = dataHex.substr(i * 2, this.seg_data_length * 2);
            const chunkByteLen = dataChunk.length / 2;
            const length = addrBytes + chunkByteLen + 1;
            const lengthHex = length.toString(16).toUpperCase().padStart(2, '0');

            let sum = length;
            for (let j = 0; j < addrHex.length; j += 2) sum += parseInt(addrHex.substr(j, 2), 16);
            for (let j = 0; j < dataChunk.length; j += 2) sum += parseInt(dataChunk.substr(j, 2), 16);
            const checksum = ((sum ^ 0xFF) & 0xFF).toString(16).toUpperCase().padStart(2, '0');

            lines.push(`${type}${lengthHex}${addrHex}${dataChunk}${checksum}`);
        }

        return lines;
    }

    parseSRecord(line) {
        line = line.trim();
        const match = line.match(/^S(\d)([0-9A-F]{2})([0-9A-F]+)([0-9A-F]{2})$/i);
        if (!match) return null;

        const [, typeChar, lengthHex, addrAndData, checksumHex] = match;
        const type = parseInt(typeChar, 10);
        const length = parseInt(lengthHex, 16);

        let addrBytes;
        switch (type) {
            case 0: case 1: case 9: addrBytes = 2; break;
            case 2: case 8: addrBytes = 3; break;
            case 3: case 7: addrBytes = 4; break;
            case 5: addrBytes = 2; break;
            default: return null;
        }

        const expectedHexLen = (length - 1) * 2;
        if (addrAndData.length !== expectedHexLen) return null;

        const addrHexLen = addrBytes * 2;
        const addressHex = addrAndData.slice(0, addrHexLen);
        const dataHex = addrAndData.slice(addrHexLen);
        const dataBytesLength = length - 1 - addrBytes;

        const bytes = [length];
        for (let i = 0; i < addressHex.length; i += 2) bytes.push(parseInt(addressHex.substr(i, 2), 16));
        for (let i = 0; i < dataHex.length; i += 2) bytes.push(parseInt(dataHex.substr(i, 2), 16));

        const sum = bytes.reduce((s, b) => s + b, 0) + parseInt(checksumHex, 16);
        const valid = (sum & 0xFF) === 0xFF;

        return {
            type: `S${type}`,
            length,
            data_length: dataBytesLength,
            address: parseInt(addressHex, 16),
            address_length: addrBytes,
            data: dataHex,
            checksum: parseInt(checksumHex, 16),
            valid,
        };
    }
}

async function autoCompleteGeneratedS19() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;

    const config = vscode.workspace.getConfiguration("cmake").get("buildDirectory");
    const project_name = vscode.workspace.getConfiguration("renesas")?.get("project_name", "renesas") || ""
    if (!config) {
        vscode.window.showErrorMessage(`cmake.buildDirectory is not set`);
        return;
    }

    const varEnv = {
        workspaceFolder: workspaceFolders[0]?.uri.fsPath || ''
    };
    const resolvePath = resolveVariables(config, varEnv);
    const dirUri = vscode.Uri.file(resolvePath);

    try {
        const entries = await vscode.workspace.fs.readDirectory(dirUri);
        const files = entries
            .filter(([fileName, fileType]) => fileType === vscode.FileType.File && fileName.startsWith(project_name) && !["abs", "map", "x"].includes(fileName.split(".")[1]))
            .map(([fileName]) => vscode.Uri.joinPath(dirUri, fileName));

        const filesByLang = {};
        for (const file of files) {
            let doc = null;
            try {
                doc = await vscode.workspace.openTextDocument(file);
            } catch { /* skip files that can't be opened */ }
            if (doc) {
                if (!filesByLang[doc.languageId]) filesByLang[doc.languageId] = [];
                filesByLang[doc.languageId].push(file);
            }
        }

        const s19Files = filesByLang['s19'] || [];
        for (const s19File of s19Files) {
            if (!s19File.fsPath.includes('format')) {
                await reformatSRecordFile(s19File);
            }
        }
    } catch (error) {
        vscode.window.showErrorMessage(error);
    }
}

module.exports = {
    reformatSRecordFile,
    reformatSRecordFileInDocument,
    autoCompleteGeneratedS19
};
