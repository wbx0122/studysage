@echo off
chcp 65001 >nul 2>&1
title 思齐 StudySage 学习智能体
cd /d "%~dp0"

echo ============================================
echo   思齐 StudySage · AI 学习辅助智能体
echo ============================================
echo.

where node >nul 2>&1
if %errorlevel%==0 (
    set NODE_CMD=node
) else (
    if exist "C:\Program Files\nodejs\node.exe" (
        set NODE_CMD="C:\Program Files\nodejs\node.exe"
    ) else (
        echo [错误] 未检测到 Node.js，请先安装：
        echo        https://nodejs.org/zh-cn/download
        echo.
        pause
        exit /b 1
    )
)

echo 正在启动服务...
echo 启动后请在浏览器访问：http://127.0.0.1:8090
echo 关闭此窗口即可停止服务
echo.

%NODE_CMD% server.js

pause