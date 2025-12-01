# 导出增强方案：格式选择、压缩率、大小预览与打包下载

## 参考实现（纯 JS 高星仓库）
- **JSZip** (github.com/Stuk/jszip)：打包多图 ZIP，无需后台。
- **FileSaver.js** (github.com/eligrey/FileSaver.js)：浏览器触发保存（若不直接用 `a[href=blobURL]`）。
- **Compressor.js** (github.com/fengyuanchen/compressorjs)：前端 JPEG 压缩思路，可参考质量参数与元数据处理；我们可直接用 `canvas.toBlob(type, quality)` 简化。

## 目标体验
- 导出时弹出二级选框（modal/drawer）：可选格式 PNG/JPG；选择 JPG 时显示质量滑杆（0.1–0.95）。
- 列表预览：展示每张导出图的预估尺寸（宽×高）与预计文件大小（基于 `canvas.toBlob` 或质量推算）。
- 支持“单张逐个下载”和“打包下载 ZIP”两个动作；保留原有一键导出默认行为（可沿用上次选择）。
- 不影响现有预览/排序/文件名标识/汉化模式，导出结果仍不包含预览标签。

## 数据与状态
- 新增导出配置状态：`exportConfig = { format: 'png'|'jpg', quality: 0.92 }`，保存在前端内存，可复用上次选择。
- 预览数据：在弹窗打开时生成/缓存导出 canvases（复用 `renderStripsToCanvases`，但按当前格式/质量获取 `Blob` & size）；避免重复计算可加简单缓存（格式+质量+strip hash）。

## UI/交互
- 在侧栏导出按钮上弹出 modal：包含格式单选、质量滑杆（仅 JPG）、图片尺寸/大小列表、操作按钮（“导出当前”“打包下载 ZIP”“取消”）。
- 列表项显示：`名称/索引`、`WxH`、`预计大小`。质量调整时实时更新大小（debounce）。
- 默认按钮行为：沿用现有导出；若用户在弹窗确认，更新 `exportConfig` 并执行对应操作。

## 技术实现
- 生成 Blob：`canvas.toBlob(resolve, mime, quality)`；若浏览器失败用 `toDataURL` + `dataUrlToBlob` 兜底。
- 预估大小：使用实际 `blob.size`；需异步收集后更新 UI。
- ZIP 打包：用 JSZip 将 Blob 加入 `folder.file(name, blob)`, 再 `generateAsync({ type:'blob' })` → download。
- 下载：优先使用 `URL.createObjectURL` + `<a download>`；如需兼容可落回 FileSaver.js。

## 实施步骤
1) **状态与 UI**
   - 添加 `exportConfig` 默认值；新增导出设置 modal 的 DOM（格式单选、质量滑杆、列表、按钮）。
   - 绑定开关：点击导出按钮打开 modal；保留原按钮快速导出可选（如“快捷导出”）。
2) **数据管线**
   - 扩展 `renderStripsToCanvases(format, quality)` 支持 mime/quality，并返回 `canvases`。
   - 新增 `collectExportPreviews(format, quality)`：生成 blobs + size + name（`collage_01.png/jpg`）。
3) **动作**
   - “导出当前”：遍历 blobs 逐个触发下载。
   - “打包下载”：用 JSZip 打包 blobs，完成后下载 zip。
4) **预览列表更新**
   - modal 打开或质量变更时刷新列表，显示尺寸和 blob size（友好单位）。
5) **验收**
   - PNG/JPG 均可导出；JPG 质量可调且大小预估随之变化。
   - 多张时可单独下载或 ZIP 打包；无异常阻塞 UI；导出文件无预览标签。***
