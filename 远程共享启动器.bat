@echo off
chcp 65001 >nul 2>&1
title 思齐 StudySage · 远程共享模式
cd /d "%~dp0"

echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo   思齐 StudySage · 远程共享模式
echo   生成公网链接，任何电脑都能访问
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.

:: ── 1. 启动本地服务器（如未运行） ──
curl -s -o nul -I "http://127.0.0.1:8090/" >nul 2>&1
if %errorlevel%==0 (
    echo [√] 本地服务已在运行
) else (
    echo [..] 正在启动本地服务...
    where node >nul 2>&1
    if %errorlevel%==0 (
        start "思齐 StudySage 服务" /min cmd /c "node server.js"
    ) else (
        if exist "C:\Program Files\nodejs\node.exe" (
            start "思齐 StudySage 服务" /min cmd /c ""C:\Program Files\nodejs\node.exe" server.js"
        ) else (
            echo [×] 未检测到 Node.js，请先安装：https://nodejs.org/zh-cn/download
            pause
            exit /b 1
        )
    )
    :: 等待服务就绪
    set /a cnt=0
    :wait_server
    timeout /t 1 /nobreak >nul 2>&1
    set /a cnt+=1
    curl -s -o nul -I "http://127.0.0.1:8090/" >nul 2>&1
    if %errorlevel%==0 goto :server_ok
    if %cnt% lss 10 goto :wait_server
    echo [×] 服务启动超时
    pause
    exit /b 1
)
:server_ok
echo [√] 本地服务已就绪：http://127.0.0.1:8090
echo.

:: ── 2. 启动 Cloudflare 公网隧道 ──
if not exist "%~dp0cloudflared.exe" (
    echo [..] 首次使用，正在下载 cloudflared...
    powershell -NoProfile -Command "Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile '%~dp0cloudflared.exe' -TimeoutSec 120"
    if not exist "%~dp0cloudflared.exe" (
        echo [×] cloudflared 下载失败，请检查网络后重试
        pause
        exit /b 1
    )
)

echo [..] 正在连接 Cloudflare 公网隧道...
echo      隧道建立后，上方会显示 https://xxx.trycloudflare.com 链接
echo      把那个链接发给任何人，都能在浏览器打开你的思齐
echo      （每次启动链接会变，以窗口显示的最新链接为准）
echo.

cloudflared.exe tunnel --url http://localhost:8090

echo.
echo [×] 隧道已断开。重新运行本脚本可重建链接。
pause