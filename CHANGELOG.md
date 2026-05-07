# Change Log

All notable changes to the "cdtheadlessbuild-renesascsp2cmake" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.1.10] - 2026-05-07

### Added
- 新增 `renesas.project_name` 配置项，支持自定义 CMake 项目名称 (默认 `renesas`)
- S-record 格式化增加进度通知和取消操作支持，提升大文件处理时的用户体验
- `autoCompleteGeneratedS19` 增加项目名称前缀过滤，仅匹配当前项目生成的文件

### Changed
- CMakeLists.txt 模板项目名由硬编码改为从配置读入的动态变量 `<%- project_name %>`
- S-record 格式化函数使用 `vscode.window.withProgress` 包裹，支持进度展示

## [0.1.9] - 2024-12-01

### Added
- Update to support latest VS Code API version 1.95.0
- Add comprehensive error handling and logging
- Improve S-Record file reformatting functionality
- Enhanced project tree performance and stability
- Fixed various bugs in CSP2CMake conversion process

## [0.0.4] - 2024-11-15

### Added
- Add renesas cs+ project tree view sorted. Now it can be sorted by project name.

## [0.0.3] - 2024-11-01

### Added
- Add renesas cs+ transition to cmake feature.

## [0.0.2] - 2024-10-20

### Fixed
- Fixed in source space, the sample level work space will occur an error.

## [0.0.1] - 2024-10-10

### Added
- Initial release with basic Eclipse CDT headless build support
- Basic project tree view functionality
- S-Record file reformatting capabilities

[Unreleased]: https://github.com/wang-zhuo996/cdtheadless-renesas-csp2cmake/compare/v0.1.9...HEAD
[0.1.9]: https://github.com/wang-zhuo996/cdtheadless-renesas-csp2cmake/compare/v0.0.4...v0.1.9
[0.0.4]: https://github.com/wang-zhuo996/cdtheadless-renesas-csp2cmake/compare/v0.0.3...v0.0.4
[0.0.3]: https://github.com/wang-zhuo996/cdtheadless-renesas-csp2cmake/compare/v0.0.2...v0.0.4
[0.0.2]: https://github.com/wang-zhuo996/cdtheadless-renesas-csp2cmake/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/wang-zhuo996/cdtheadless-renesas-csp2cmake/releases/tag/v0.0.1