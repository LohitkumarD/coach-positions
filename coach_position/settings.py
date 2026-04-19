from pathlib import Path
import os
import sys
import environ

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env(
    DJANGO_DEBUG=(bool, False),
    ALERT_RETRY_MAX_ATTEMPTS=(int, 5),
    ALERT_RETRY_BACKOFF_SECONDS=(int, 10),
    CRITICAL_ACK_TIMEOUT_SECONDS=(int, 180),
    SSE_HEARTBEAT_SECONDS=(int, 30),
)
environ.Env.read_env(BASE_DIR / ".env")

# PWA Web Share Target ingest (POST /pwa/incoming-share). Disable to stop accepting shares without redeploying manifest.
PWA_SHARE_INGEST_ENABLED = env.bool("PWA_SHARE_INGEST_ENABLED", default=True)

# Pytest sets DATABASE_URL=sqlite:///:memory: on purpose; do not override that.
# A stale :memory: in an interactive shell (e.g. after running pytest) blocks `.env` (django-environ
# uses setdefault), so runserver hits an empty DB → OperationalError on session/login.
if (
    "pytest" not in sys.modules
    and os.environ.get("DATABASE_URL", "").startswith("sqlite:///:memory:")
):
    os.environ.pop("DATABASE_URL", None)
    environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("DJANGO_SECRET_KEY", default="unsafe-default-change-me")
DEBUG = env("DJANGO_DEBUG")
ALLOW_OPEN_REGISTRATION = env.bool("ALLOW_OPEN_REGISTRATION", default=False)
ALLOWED_HOSTS = [x.strip() for x in env("DJANGO_ALLOWED_HOSTS", default="*").split(",") if x.strip()]
CSRF_TRUSTED_ORIGINS = [x.strip() for x in env("CSRF_TRUSTED_ORIGINS", default="").split(",") if x.strip()]
if DEBUG and not CSRF_TRUSTED_ORIGINS:
    CSRF_TRUSTED_ORIGINS = [
        "http://127.0.0.1:8000",
        "http://localhost:8000",
    ]

# Compatibility with simple `.env` templates that use generic keys.
if os.getenv("SECRET_KEY") and not os.getenv("DJANGO_SECRET_KEY"):
    SECRET_KEY = os.getenv("SECRET_KEY", SECRET_KEY)
if os.getenv("DEBUG") and not os.getenv("DJANGO_DEBUG"):
    DEBUG = os.getenv("DEBUG", "False").lower() in {"1", "true", "yes"}
if DEBUG and "testserver" not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append("testserver")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "ops",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "ops.middleware.CorrelationIdMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "coach_position.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {"context_processors": [
            "django.template.context_processors.debug",
            "django.template.context_processors.request",
            "django.contrib.auth.context_processors.auth",
            "django.contrib.messages.context_processors.messages",
            "ops.context_processors.app_shell",
        ]},
    }
]

WSGI_APPLICATION = "coach_position.wsgi.application"
ASGI_APPLICATION = "coach_position.asgi.application"

DATABASES = {"default": env.db("DATABASE_URL", default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}")}

# Neon connection strings often set channel_binding=require. Some Windows + psycopg + OpenSSL
# combinations raise on connect or on commits (e.g. session save during login), surfacing as HTTP 500.
# Default to "prefer"; set PG_CHANNEL_BINDING=require in production if your client stack supports it.
if DATABASES["default"].get("ENGINE") == "django.db.backends.postgresql":
    _opts = DATABASES["default"].setdefault("OPTIONS", {})
    _opts["channel_binding"] = env("PG_CHANNEL_BINDING", default="prefer")

AUTH_USER_MODEL = "ops.UserProfile"

AUTHENTICATION_BACKENDS = [
    "ops.backends.PhoneOrUsernameBackend",
    "django.contrib.auth.backends.ModelBackend",
]

LOGIN_REDIRECT_URL = "/"
LOGOUT_REDIRECT_URL = "/accounts/login/"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework.authentication.SessionAuthentication",
        "rest_framework.authentication.BasicAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "user": "120/min",
    },
}

ALERT_RETRY_MAX_ATTEMPTS = env("ALERT_RETRY_MAX_ATTEMPTS")
ALERT_RETRY_BACKOFF_SECONDS = env("ALERT_RETRY_BACKOFF_SECONDS")
CRITICAL_ACK_TIMEOUT_SECONDS = env("CRITICAL_ACK_TIMEOUT_SECONDS")
SSE_HEARTBEAT_SECONDS = env("SSE_HEARTBEAT_SECONDS")
FCM_CREDENTIALS_JSON = env("FCM_CREDENTIALS_JSON", default="")
# Stale empty GEMINI_API_KEY in the environment blocks the value from `.env` (django-environ uses setdefault).
if not (os.environ.get("GEMINI_API_KEY") or "").strip():
    os.environ.pop("GEMINI_API_KEY", None)
    environ.Env.read_env(BASE_DIR / ".env")


def _gemini_api_key_from_dotenv_file() -> str:
    """Read GEMINI_API_KEY=... from .env when django-environ did not apply it."""
    path = BASE_DIR / ".env"
    if not path.is_file():
        return ""
    try:
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("GEMINI_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    except OSError:
        return ""
    return ""


GEMINI_API_KEY = env("GEMINI_API_KEY", default="")
GEMINI_MODEL = env("GEMINI_MODEL", default="gemini-1.5-flash-latest")
if not (GEMINI_API_KEY or "").strip():
    _gk = _gemini_api_key_from_dotenv_file()
    if _gk:
        GEMINI_API_KEY = _gk
        os.environ["GEMINI_API_KEY"] = _gk

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "structured": {
            "format": "%(asctime)s %(levelname)s %(name)s %(message)s"
        }
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "structured",
        }
    },
    "root": {"handlers": ["console"], "level": "INFO"},
}

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
# When a reverse proxy sends X-Forwarded-Host (uncommon on Render), enable and extend DJANGO_ALLOWED_HOSTS.
USE_X_FORWARDED_HOST = env.bool("DJANGO_USE_X_FORWARDED_HOST", default=False)
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
SECURE_HSTS_SECONDS = 31536000 if not DEBUG else 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = not DEBUG
SECURE_HSTS_PRELOAD = not DEBUG
X_FRAME_OPTIONS = "DENY"
