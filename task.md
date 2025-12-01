# Task: 导出增强（格式/质量/大小预览/ZIP）

## 目标
- 导出时可选 PNG/JPG，JPG 可调质量；显示每张导出图的尺寸与大小；支持单张下载与 ZIP 打包。
- 保持现有导出/复制与预览标签不变（导出内容不含标签）。

## 工作项
1) 状态与 UI
   - 新增 `exportConfig = { format: 'png', quality: 0.92 }`。
   - 在界面添加导出设置 modal：格式单选、质量滑杆（仅 JPG）、尺寸/大小列表、动作按钮（导出当前/打包/取消）。

2) 数据管线
   - 扩展 `renderStripsToCanvases(format, quality)`；新增 `collectExportPreviews` 生成 blobs + size + 建议文件名。
   - 失败兜底：`toDataURL` → `dataUrlToBlob`。

3) 动作实现
   - “导出当前”：遍历 blobs 触发下载。
   - “打包下载”：用 JSZip 生成 zip → 下载。
   - 质量变更时 debounce 重新计算大小列表。

4) 预览列表
   - 在 modal 中展示 `name`, `WxH`, `size`（友好单位）；格式/质量变化实时刷新。

5) 验收
   - PNG/JPG 导出成功，JPG 质量影响大小。
   - 多张可单独下载或 ZIP；导出文件无预览标签，现有功能无回归。
