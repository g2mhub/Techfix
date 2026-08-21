"""TechFix OS — entrypoint WSGI para gunicorn no Render.

No dev/local/Docker o processo e `python -m server.app`, que chama
`init_db()` dentro de `run()`. Via gunicorn o processo apenas importa o
app, entao o boot do banco (schema + usuario admin) e garantido aqui, no
import — e por ser idempotente, e seguro rodar a cada inicializacao.

Tambem instala o ProxyFix: atras do proxy do Render o Flask precisa
confiar no X-Forwarded-Proto para que `request.is_secure` reflita o
HTTPS publico e o cookie de sessao receba o atributo `Secure`.
"""
from werkzeug.middleware.proxy_fix import ProxyFix

from server.app import app
from server.db import init_db

app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)

with app.app_context():
    init_db()
