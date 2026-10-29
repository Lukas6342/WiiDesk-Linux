#!/bin/sh
# Installiert WiiDesk als Desktop-Session (Arch). Aufruf: sudo ./install.sh
set -e

[ "$(id -u)" -eq 0 ] || { echo "Bitte als root ausführen: sudo ./install.sh"; exit 1; }

SRC="$(cd "$(dirname "$0")" && pwd)"

if command -v pacman >/dev/null 2>&1; then
    pacman -S --needed --noconfirm openbox nodejs npm
fi

mkdir -p /opt/wiidesk
tar -C "$SRC" --exclude=.git --exclude=node_modules -cf - . | tar -C /opt/wiidesk -xf -
(cd /opt/wiidesk && npm install)

install -Dm755 "$SRC/session/wiidesk-session" /usr/local/bin/wiidesk-session
install -Dm644 "$SRC/session/wiidesk.desktop" /usr/share/xsessions/wiidesk.desktop

echo "Fertig. Abmelden und im Login-Manager die Session 'WiiDesk' wählen."
