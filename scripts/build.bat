@echo off
REM ============================================================
REM  TechFix OS — build dos executáveis (Windows)
REM  Gera: dist\TechFixServer.exe (servidor) e dist\install.exe (instalador)
REM ============================================================
setlocal
cd /d "%~dp0.."

echo [1/4] Verificando dependencias...
if not exist ".venv\Scripts\python.exe" (
    echo     Criando ambiente virtual .venv...
    python -m venv .venv || goto :err
)
".venv\Scripts\python.exe" -m pip install --quiet --disable-pip-version-check -r requirements-build.txt || goto :err

echo [2/4] Compilando TechFixServer.exe (backend + UI empacotados)...
".venv\Scripts\python.exe" -m PyInstaller --noconfirm --clean --onefile --name TechFixServer ^
    --add-data "index.html;." ^
    --add-data "css;css" ^
    --add-data "js;js" ^
    --hidden-import=bcrypt ^
    entry_server.py || goto :err

echo [3/4] Compilando install.exe (instalador com servidor embutido)...
if not exist "installer\install.py" (
    echo     AVISO: installer\install.py nao encontrado - instalador sera pulado.
    echo     Para gerar install.exe, adicione o script do instalador em installer\.
) else (
    ".venv\Scripts\python.exe" -m PyInstaller --noconfirm --clean --onefile --windowed --name install ^
        --add-binary "dist\TechFixServer.exe;." ^
        installer\install.py || goto :err
)

echo.
echo [4/4] Concluido!
echo.
echo     Servidor : dist\TechFixServer.exe
echo     Instalador: dist\install.exe (somente se installer\install.py existir)
echo.
echo     Para testar o instalador: dist\install.exe --dir C:\TechFixOS
endlocal
exit /b 0

:err
echo.
echo [ERRO] Falha no build. Veja a mensagem acima.
endlocal
exit /b 1
