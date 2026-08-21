"""TechFix OS — entry point do executável do servidor (PyInstaller).

Empacota backend + UI num único TechFixServer.exe. Ao iniciar:
  1. cria o banco SQLite com o schema + usuário administrador padrão
     (admin/123456) no primeiro boot;
  2. sobe o Flask em http://127.0.0.1:PORT (padrão 8432);
  3. abre o navegador automaticamente.

Se o servidor já estiver rodando na porta (segundo clique no atalho), apenas
abre o navegador e encerra — sem tentar subir uma segunda instância.
"""
import os
import socket
import sys
import threading
import time
import webbrowser

from server.app import run


def _port_in_use(port):
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.5):
            return True
    except OSError:
        return False


def _abrir_navegador_quando_pronto(url, timeout=10.0):
    """Abre o navegador assim que a porta responder (ou após o timeout)."""
    def wait_and_open():
        deadline = time.time() + timeout
        while time.time() < deadline:
            if _port_in_use(int(url.rsplit(":", 1)[1])):
                webbrowser.open(url)
                return
            time.sleep(0.3)
        webbrowser.open(url)  # desiste de esperar, tenta mesmo assim

    threading.Thread(target=wait_and_open, daemon=True).start()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8432))
    url = "http://127.0.0.1:%d" % port

    if _port_in_use(port):
        print("TechFix OS já está rodando em %s — abrindo o navegador." % url, flush=True)
        webbrowser.open(url)
        sys.exit(0)

    print("=" * 54, flush=True)
    print("  TechFix OS — servidor local")
    print("  " + url)
    print("  Pressione Ctrl+C para encerrar.")
    print("=" * 54, flush=True)
    _abrir_navegador_quando_pronto(url)
    run()
