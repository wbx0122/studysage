@echo off
chcp 65001 >nul 2>&1
cd /d "d:\思齐 StudySage 完整工程（29 个文件）\source"

:: 检测服务器是否已在运行
curl -s -o nul -I "http://127.0.0.1:8090/" >nul 2>&1
if %errorlevel%==0 goto :open

:: 服务器未运行 → 在最小化窗口中启动
where node >nul 2>&1
if %errorlevel%==0 (
    start "思齐 StudySage 服务" /min cmd /c "node server.js"
) else (
    if exist "C:\Program Files\nodejs\node.exe" (
        start "思齐 StudySage 服务" /min cmd /c ""C:\Program Files\nodejs\node.exe" server.js"
    ) else (
        msg * "未检测到 Node.js，请先安装：https://nodejs.org/zh-cn/download"
        exit
    )
)

:: 等待服务器就绪（最多 15 秒）
set /a cnt=0
:wait
timeout /t 1 /nobreak >nul 2>&1
set /a cnt+=1
curl -s -o nul -I "http://127.0.0.1:8090/" >nul 2>&1
if %errorlevel%==0 goto :open
if %cnt% lss 15 goto :wait

:open
start "" "http://127.0.0.1:8090"
exit