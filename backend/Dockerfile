# syntax=docker/dockerfile:1.7

ARG DEBIAN_MIRROR=http://deb.debian.org/debian
ARG DEBIAN_SECURITY_MIRROR=http://deb.debian.org/debian-security
ARG PYPI_INDEX_URL=https://pypi.org/simple

FROM python:3.12-slim-bookworm AS python-deps

ARG DEBIAN_MIRROR
ARG DEBIAN_SECURITY_MIRROR
ARG PYPI_INDEX_URL

ENV PIP_INDEX_URL=${PYPI_INDEX_URL} \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1

RUN sed -i \
        -e "s|^URIs: http://deb.debian.org/debian-security$|URIs: ${DEBIAN_SECURITY_MIRROR}|" \
        -e "s|^URIs: http://deb.debian.org/debian$|URIs: ${DEBIAN_MIRROR}|" \
        /etc/apt/sources.list.d/debian.sources \
    && apt-get update \
    && apt-get install --yes --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN python -m venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH

COPY backend/requirements.txt /tmp/requirements.txt
RUN python -m pip install --upgrade pip setuptools wheel \
    && python -m pip install --requirement /tmp/requirements.txt


FROM python:3.12-slim-bookworm AS runtime

ARG DEBIAN_MIRROR
ARG DEBIAN_SECURITY_MIRROR

ENV PATH=/opt/venv/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HOME=/tmp/paper-tracker-home \
    XDG_CONFIG_HOME=/tmp/paper-tracker-home/.config \
    TESSERACT_CMD=/usr/bin/tesseract

RUN sed -i \
        -e "s|^URIs: http://deb.debian.org/debian-security$|URIs: ${DEBIAN_SECURITY_MIRROR}|" \
        -e "s|^URIs: http://deb.debian.org/debian$|URIs: ${DEBIAN_MIRROR}|" \
        /etc/apt/sources.list.d/debian.sources \
    && apt-get update \
    && apt-get install --yes --no-install-recommends \
        fontconfig \
        fonts-noto-cjk \
        gzip \
        libreoffice-calc \
        libreoffice-core \
        libreoffice-impress \
        libreoffice-writer \
        tar \
        tesseract-ocr \
        tesseract-ocr-chi-sim \
        tesseract-ocr-eng \
        tesseract-ocr-osd \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --home-dir /home/paper-tracker --uid 10001 --user-group paper-tracker

COPY --from=python-deps /opt/venv /opt/venv

WORKDIR /app/backend
COPY --chown=paper-tracker:paper-tracker backend/app ./app
COPY --chown=paper-tracker:paper-tracker backend/main.py ./main.py
COPY --chown=paper-tracker:paper-tracker shared /app/shared

RUN mkdir -p /app/backend/data \
    && chown -R paper-tracker:paper-tracker /app/backend/data

USER paper-tracker

EXPOSE 5002

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "5002", "--workers", "1", "--no-access-log"]
