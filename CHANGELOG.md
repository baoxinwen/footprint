# Changelog

本项目所有显著变更都将记录在本文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [1.0.0] - 2026-09-01

### Added

- 用户认证：注册、登录、修改密码，JWT 鉴权，登录失败限流与锁定
- 旅行管理：旅程/地点/照片的创建、编辑、删除，地点 POI 搜索与拖拽排序
- 高德地图足迹：城市标记、路线绘制、照片地图模式（GCJ-02 坐标系）
- 时间线：按年月分组回溯旅程
- 统计分析：年度/月度曲线与城市排行
- 分享链接：30 天有效期的匿名分享页
- 数据迁移：JSON 导出/导入，ZIP 导出打包照片与 Markdown 游记
- 深色模式：跟随系统/浅色/深色三种切换
- 部署：Docker Compose 一键自托管，nginx 反代 /api，GitHub Actions 自动构建 GHCR 镜像
- 测试：pytest 单元/集成/部署实例测试，Vitest 组件测试，Playwright 端到端测试

[Unreleased]: https://github.com/baoxinwen/footprint/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/baoxinwen/footprint/releases/tag/v1.0.0
