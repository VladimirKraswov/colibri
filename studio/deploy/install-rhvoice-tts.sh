#!/usr/bin/env bash
set -euo pipefail

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  ca-certificates python3 python3-pip python3-venv rhvoice rhvoice-russian

id rhvoice-tts >/dev/null 2>&1 || useradd --system --home /var/lib/rhvoice-tts --shell /usr/sbin/nologin rhvoice-tts
install -d -o root -g rhvoice-tts -m 0750 /opt/rhvoice-tts
python3 -m venv /opt/rhvoice-tts/.venv
/opt/rhvoice-tts/.venv/bin/pip install --no-cache-dir -r /opt/rhvoice-tts/requirements.txt
chown -R root:rhvoice-tts /opt/rhvoice-tts
chmod -R g=rX,o= /opt/rhvoice-tts
install -m 0644 /opt/rhvoice-tts/rhvoice-tts.service /etc/systemd/system/rhvoice-tts.service
systemctl daemon-reload
systemctl enable --now rhvoice-tts.service
