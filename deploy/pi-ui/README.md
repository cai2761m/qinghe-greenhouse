# 树莓派实机界面

访问地址：<http://192.168.1.219:8090/>。

此目录针对树莓派 `/opt/greenhouse/web` 中已接入实机的网页。该网页的 Vue 构建包已有设备桥接修改，因此保留原有构建包，通过独立主题和桥接面板更新界面，不使用本仓库的演示构建包覆盖实机版。

## 本次调整

- 深绿导航、暖白背景和浅绿状态色，统一标题、卡片、表格、弹窗及控制按钮。
- 现场画面、室内温度、棒体温度、加热目标、执行器状态组成一个监控面板。
- 摄像头标记、画面更新时间、连接失败提示和同页保存现场画面。
- 1024×600 展示屏压缩欢迎区，现场监控及加热、旋转按钮在首屏完整呈现；手机端改为纵向排列。
- 保留现有硬件接口、设备映射、自动控制逻辑及旋转暂停二次确认。加热输入增加 0–35°C 的界面校验；后端保护保持原状。
- 主题的字体和装饰不依赖外网服务。

## 文件

- `assets/qinghe-refined.css`：在原构建样式后加载的主题与响应式布局。
- `gh-bridge.js`：由树莓派原文件修改，重排监控面板，保留原 API。
- `install.sh`：先备份整个 `web`，再安装主题、桥接脚本，并向原 `index.html` 添加样式引用。
- `preview.py`：仅代理 GET `/status`、`/health`、`/snapshot` 的本地预览服务器，所有 POST 均返回 403，不会向硬件下发测试指令。

## 已完成验证

- JavaScript 语法检查通过。
- 桌面 1440×1000、展示屏 1024×600、手机 390×844 的布局检查通过，展示屏和手机无横向溢出。
- 手机导航、日志搜索、设置弹窗、超出范围的加热输入校验通过。
- 部署后首页、主题文件均返回 HTTP 200；摄像头画面加载成功，无浏览器脚本错误。
- 部署文件 SHA-256 与本地一致。
- `greenhouse-host.service` 和重新加载后的 `greenhouse-kiosk.service` 均为 active。
- 未通过测试操作硬件执行器。

## 2026-10-16 部署

远程备份：`/opt/greenhouse/backups/ui-before-refinement-20261016T141012Z.tar.gz`。

更新位置：

```text
/opt/greenhouse/web/index.html
/opt/greenhouse/web/gh-bridge.js
/opt/greenhouse/web/assets/qinghe-refined.css
```

原构建资源及 Python 设备服务没有替换。备份保存在树莓派上，本地原文件副本位于工作区 `pi-snapshot/web`。没有将 SSH 密码保存到发布文件中。

回退时，将上述备份中的 `web` 还原到 `/opt/greenhouse`，然后重新加载展示服务：

```sh
sudo tar -xzf /opt/greenhouse/backups/ui-before-refinement-20261016T141012Z.tar.gz -C /opt/greenhouse
sudo systemctl restart greenhouse-kiosk.service
```

还原后的原 `index.html` 不再引用新主题，多余的主题文件不会生效。
