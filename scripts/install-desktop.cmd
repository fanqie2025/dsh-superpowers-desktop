@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

rem ===========================================================================
rem  把本包安装进 DeepSeek Harness 桌面端的 desktop profile
rem
rem  用法：先【完全退出 DeepSeek Harness 桌面端】，再双击本文件。
rem  原因：dsh 运行时锁住 profile 的 node_modules，带着它跑 pnpm 安装会失败或半途回滚。
rem ===========================================================================

echo.
echo === dsh-superpowers-desktop 安装到 profile: desktop ===
echo.

rem 本机宿主注入的 NODE_OPTIONS（safe-delete shim）会让 dsh 假启动失败，必须清空
set "NODE_OPTIONS="
echo [i] 已清空 NODE_OPTIONS

rem 取本仓库根目录（去掉结尾反斜杠）
for %%I in ("%~dp0..") do set "PKG=%%~fI"
echo [i] 包路径: %PKG%

if not exist "%PKG%\package.json" (
  echo [x] 这里不像本包的根目录（没找到 package.json）
  goto :fail
)

set "CLI=D:\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd"
if not exist "%CLI%" (
  echo [x] 找不到桌面端 CLI: %CLI%
  echo     如果你把 DeepSeek Harness 装在别处，请改本文件里的 CLI 变量。
  goto :fail
)
echo [i] 使用 CLI: %CLI%
echo.

tasklist /fi "imagename eq DeepSeek Harness.exe" 2>nul | find /i "DeepSeek Harness.exe" >nul
if not errorlevel 1 (
  echo [!] 检测到 DeepSeek Harness 正在运行。
  echo     请先完全退出桌面端再运行本脚本，否则安装可能失败或回滚。
  echo.
  pause
  goto :fail
)

echo [*] 开始安装（走本地路径）...
call "%CLI%" plugin --profile desktop add "%PKG%"
set "RC=%ERRORLEVEL%"
echo.

if not "%RC%"=="0" (
  echo [x] 安装失败，退出码 %RC%
  echo     常见原因：core 版本与 peerDependencies 不匹配（用 dsh plugin allow-version 放行）、
  echo     或桌面端没退干净。
  goto :fail
)

echo [√] 安装命令已成功执行。
echo.
echo     下一步：重新打开 DeepSeek Harness 桌面端，技能才会注册生效。
echo     验证：在新会话里问一句「列出当前可用的技能」，应能看到 brainstorming、writing-plans 等。
echo.
pause
exit /b 0

:fail
echo.
pause
exit /b 1
