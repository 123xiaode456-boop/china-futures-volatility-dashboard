# 国内商品期货波动率网页

这是一个静态网页工程，用于查看国内商品期货主力或连续合约的日频波动率。

## 页面入口

- 本地网页目录：`工程内容/site`
- 本地数据文件：`工程内容/site/data/volatility.json`
- 页面文件：`工程内容/site/index.html`

## 本地生成样例数据

```powershell
$python = "C:\Users\janzh\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
& $python "工程内容\src\generate_data.py" --mode sample --output "工程内容\site\data\volatility.json"
```

## 本地预览网页

```powershell
$python = "C:\Users\janzh\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
& $python -m http.server 8000 --directory "工程内容\site"
```

打开：

```text
http://localhost:8000
```

## 测试

```powershell
$python = "C:\Users\janzh\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
$node = "C:\Users\janzh\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
& $python -m unittest discover -s "工程内容\tests" -v
& $node --test "工程内容\tests\js\app.test.mjs"
```

## 线上部署

1. 把整个项目推送到 GitHub 仓库。
2. 在仓库 Settings -> Pages 中选择 GitHub Actions 作为发布来源。
3. 打开 Actions，手动运行 `Update futures volatility site`。
4. 成功后 GitHub Pages 会生成公开访问链接。

工作流文件：`.github/workflows/update-and-deploy.yml`

工作流每天 UTC 08:45 自动运行一次，约等于北京时间 16:45，用于收盘后更新日频数据。

## 数据口径

- 日收益率：`ln(close_t / close_t-1)`
- 20 日年化波动率：最近 20 个收益率标准差乘以 `sqrt(252)`
- 60 日年化波动率：最近 60 个收益率标准差乘以 `sqrt(252)`
- 当日涨跌幅：`close_t / close_t-1 - 1`
- 当日振幅：`(high_t - low_t) / close_t-1`
- 波动率分位：当前 20 日波动率在最近一年滚动 20 日波动率序列中的百分位

## 数据源

线上 live 模式使用 AKShare 的 `futures_zh_daily_sina` 接口。若某个合约抓取失败，数据生成脚本会保留该合约并标记为“获取失败”。
