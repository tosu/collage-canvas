# Bugfix Plan: 预览提示在移动端显示错误指令

## 现象
- 在移动端（真机）打开时，预览区域右下角仍显示桌面提示：“滚轮缩放 · 中键拖拽平移 · 双击复位”，与触屏操作不符。

## 目标
- 根据平台/viewport 自动切换提示文案：桌面显示鼠标指令，移动端显示触屏指令（如“捏合缩放 · 双指拖拽平移 · 双击复位”）。
- 保持隐藏状态（`aria-hidden`）一致，桌面行为不变。

## 修复方案
1) 文案切换
   - 提供两段提示或动态生成文案；根据 `pointer` 媒体查询、`navigator.userAgent`、或 `matchMedia('(pointer: coarse)')` 选择移动/桌面文案。
   - 简单方案：在 `script.js` 中检测 coarse pointer，设置 `previewHint.textContent` 为触屏文案。
2) 样式与可见性
   - 样式无需改动；仅更新 textContent。
3) 验收
   - 真机/移动模拟下显示触屏提示；桌面保持鼠标提示；不影响其他功能。
