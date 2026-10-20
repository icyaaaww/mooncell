# Mooncakes 发布记录

发布日期：2026-10-20（Asia/Shanghai）。

- 模块：`icyaaaww/mooncell`
- 包版本：`0.1.0`
- 对应应用：GitHub Release `v1.0.0`
- 文档入口：https://mooncakes.io/docs/icyaaaww/mooncell
- 包 SHA-256：`3dbce7cd359e9e0557ec5d61e50f9096aafd639371f770c9a2f40d89e12a045f`

当前工具拒绝非零主版本，因此核心包与应用分别编号。此次没有修改已发布应用的功能或 v1.0.0 下载文件。

## 发布与验证

1. `moon package --list` 检查打包内容，仅含 LICENSE、README.mbt.md、根包 MoonBit 源码、测试、配置和生成接口；没有工作簿、Web 界面或 npm 依赖。
2. `moon publish --dry-run` 服务端返回 202，说明验证通过且未发布。该工具对 202 返回了非零退出码；随后正式发布返回 `200 OK`。
3. `moon update` 后公开索引出现 `icyaaaww/mooncell@0.1.0`，未撤回，校验值与本地发布 ZIP 一致。
4. 源码核心回归：JS 25/25、Wasm-GC 25/25。
5. 在仓库外新建独立消费项目，执行 `moon add icyaaaww/mooncell@0.1.0`，日志确认从注册表下载。没有使用本地路径替换。
6. 消费项目的两项 API 测试在 JS 和 Wasm-GC 均通过，覆盖引用指纹、混合引用平移、结构诊断、版本比较、固定数字提示、候选重算及 IF/ROUND。

安装方法：

```sh
moon add icyaaaww/mooncell@0.1.0
```

包内导入：

```text
import {
  "icyaaaww/mooncell" @mooncell,
}
```

发布成功不等于赛事报名已提交或审核通过。真实用户效果尚未验证，检测结果仍需人工核查。
