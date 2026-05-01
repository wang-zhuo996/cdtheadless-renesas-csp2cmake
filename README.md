# cdtheadlessbuild-renesascsp2cmake README

This extension is used to help you build renesas cs+ project from vscode which use cmake(cmake file template is from `renesas-build-utilities`).

The other feature is from vscode to calling eclipse cdt build headlessly .

## Features

Help to search Eclipse CDT build configurations and build them from the command line.

## Extension Settings

This extension contributes the following settings:

* `cdtheadlessbuild.launchPath`: Set to the path to the Eclipse CDT installation.
* `cdtheadlessbuild.argsAdded`: launch arguments added to the build command

* `renesas.ccrh_toolchain_path`: Set CCRH Toolchain path.
* `renesas.genrpostbuild`: Enable post-build generation.
* `renesas.clearbuild`: Enable clean build.
* `renesas.formatpostbuild`: Enable post-build formatting.

* `srecordReformat.segDataFormat`: S-Record segment data format (S1, S2, S3).
* `srecordReformat.segDataLength`: S-Record segment data length.
* `srecordReformat.segDataFill`: S-Record segment data fill byte.
* `srecordReformat.segDataMinInterval`: S-Record segment minimum interval.
* `srecordReformat.reformatFileFormat`: S-Record reformat output file path.

## Development

### Prerequisites

- Node.js (v16 or higher)
- npm (v8 or higher)
- Visual Studio Code Extension Development Kit

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/wang-zhuo996/cdtheadless-renesas-csp2cmake.git
   cd cdtheadless-renesas-csp2cmake
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Open in VS Code**
   ```bash
   code .
   ```

4. **Build the extension**
   ```bash
   npm run compile
   ```

### Development Workflow

#### Running the Extension

1. **Press F5** to open a new window with the extension loaded
2. **Debug Console** will show the extension activation message
3. **Test the extension** with a Renesas CS+ project workspace

#### Testing

Run the test suite:
```bash
npm test
```

Run linting:
```bash
npm run lint
```

#### Building

Create a VSIX package:
```bash
npm run package
```

### Project Structure

```
cdtheadless-renesas-csp2cmake/
├── src/                    # Source files
│   └── search_file.js      # File search functionality
├── data-views/            # VS Code tree view providers
│   ├── nodeDependencies.js # Eclipse CDT project tree
│   ├── renesas-mtpj.js     # Renesas CSP2CMake functionality
│   ├── renesas-cli-parse.js # CLI command parsing
│   ├── srecord_reformat.js # S-Record file processing
│   └── template/          # CMake templates
│       ├── CMakeLists.txt # Main CMake file
│       └── cmake/         # CMake modules
├── icons/                 # Extension icons
├── test/                  # Test files
└── .vscode/              # VS Code configuration
```

### Key Components

#### Extension Entry Point (`extension.js`)
- Main extension activation and command registration
- Tree data provider registration
- Command handlers

#### Eclipse CDT Integration (`data-views/nodeDependencies.js`)
- Project tree provider for Eclipse CDT projects
- Build command execution
- Project configuration parsing

#### Renesas CSP2CMake (`data-views/renesas-mtpj.js`)
- MTPJ file parsing and processing
- CMake generation from Renesas CS+ projects
- Project management and configuration

#### S-Record Processing (`data-views/srecord_reformat.js`)
- S-Record file reformatting and optimization
- Segment data handling and formatting

### Debugging Tips

1. **Enable Developer Console**:
   ```bash
   code --debug-extension <extension-id>
   ```

2. **Check Extension Output**:
   - Open Output panel (Ctrl+Shift+P → "Output")
   - Select "Extension Host" from the dropdown

3. **Common Issues**:
   - Ensure all dependencies are installed
   - Check VS Code version compatibility
   - Verify extension activation events

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run linting and tests
6. Submit a pull request

### Dependencies

- `@vscode/codicons`: VS Code icon library
- `ejs`: Template engine for CMake generation
- `xml2js`: XML parsing for project files
- `@types/node`, `@types/vscode`: TypeScript definitions
- `eslint`: Code linting
- `@vscode/test-cli`, `@vscode/test-electron`: Testing framework

## Known Issues

Allbuild commands are not supported yet.

## Release Notes

Users appreciate release notes as you update your extension.

### 0.0.1

Initial release 

### 0.0.2

Fixed in source space , the sample level work space will occurre an error.

### 0.0.3

Add renesas cs+ transition to cmake feature.

### 0.0.4

Add renesas cs+ project tree view sorted. Now it can be sorted by project name.

### 0.1.9

- Update to support latest VS Code API version 1.95.0
- Add comprehensive error handling and logging
- Improve S-Record file reformatting functionality
- Enhanced project tree performance and stability
- Fixed various bugs in CSP2CMake conversion process

---

# README.md