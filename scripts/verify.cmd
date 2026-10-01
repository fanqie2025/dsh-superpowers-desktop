@echo off
chcp 65001 >nul
setlocal

rem ===========================================================================
rem  跑结构校验 scripts/verify.mjs
rem
rem  优先用 PATH 上的 node；没有就用桌面端自带的 runtime node（本机一定有）。
rem  可传参：verify.cmd --dsh-version 0.2.0-rc.2
rem ===========================================================================

for %%I in ("%~dp0..") do set "PKG=%%~fI"

set "NODE="
where node >nul 2>nul && set "NODE=node"
if not defined NODE (
  set "NODE=D:\DeepSeek Harness\resources\runtime\primary-runtime\dependencies\node\bin\node.exe"
)
if not exist "%NODE%" if /i not "%NODE%"=="node" (
  echo [x] 找不到 node，也找不到桌面端自带 runtime 的 node
  exit /b 1
)

echo [i] node: %NODE%
echo.
"%NODE%" "%PKG%\scripts\verify.mjs" %*
set "RC=%ERRORLEVEL%"
echo.
if "%RC%"=="0" (echo [√] 校验通过) else (echo [x] 校验未通过，退出码 %RC%)
exit /b %RC%
