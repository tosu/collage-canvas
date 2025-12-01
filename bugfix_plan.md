# Bugfix Plan: 导出预览闪烁 & ZIP 打包（原生实现方向）

## 问题概述
1) 调整 JPG 压缩率时预览列表闪烁：列表先清空/“计算中”，完成后再重建，频繁操作时体验差。
2) 当前打包提示“未找到 JSZip，已逐个下载”：没有依赖 JSZip。改用纯原生 JS 打包（自实现 ZIP）以去除外部依赖。

## 原因回顾
- 闪烁源于刷新逻辑直接重置 innerHTML，再异步重建；滑杆输入频繁触发多次。
- JSZip 缺失源于未引入依赖；这里改为原生 ZIP 写入，消除依赖需求。

## 解决方向
### A. 预览刷新防闪烁
- 使用 generation token：每次刷新生成 token，异步完成时校验 token，一致才更新。
- 不清空列表：保留现有 DOM，加载中只更新 size 字段为“...”或在顶部显示轻量提示，完成后逐项更新内容。
- 保留 debounce（~120ms），避免滑杆抖动。

### B. ZIP 原生实现替代 JSZip
- 参考 JSZip 的文件格式写法，用纯 JS 构造 ZIP：
  - 为每个文件生成本地文件头 (LFH)、中央目录 (CDH) 和 End of Central Directory (EOCD)。
  - 计算 CRC32（可用纯 JS CRC 表算法），不压缩（store 模式），写入尺寸/偏移。
  - 拼接 Uint8Array -> Blob -> 触发下载。
- 这样无需外部库，避免“未找到 JSZip”提示。

## 实施步骤
1) 预览刷新
   - 添加 `previewGenerationId`，刷新时 +1，Promise 完成后比对。
   - 刷新期间保留列表节点，只把 size 文本置为“...”或添加 loading 类；完成后更新 name/size/WxH。
2) 原生 ZIP
   - 实现 CRC32（预计算表）。
   - 写入 ZIP 结构（store）：LFH + data + CDH + EOCD。
   - 提供 `createZip(files: {name, blob}[]) -> Blob`；在打包下载时调用。
3) 提示
   - 去掉 JSZip 缺失提示；若 ZIP 构建失败，fallback 逐个下载并 toast 明确原因。

## 验收
- 调节 JPG 质量时列表不中断、不闪屏，只在 size 列短暂显示“...”。
- 打包下载无需外部依赖，生成的 ZIP 可正常解压；失败时明确提示且仍可逐个下载。***
