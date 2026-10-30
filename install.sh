#!/bin/sh
# Installs WiiDesk as a desktop session on any Linux distro.
# Usage: sudo ./install.sh
set -e

[ "$(id -u)" -eq 0 ] || { echo "Please run as root: sudo ./install.sh"; exit 1; }

SRC="$(cd "$(dirname "$0")" && pwd)"

# Install dependencies with whichever package manager is available.
# Arch ships Electron as a system package; other distros fall back to the npm copy below.
if command -v pacman >/dev/null 2>&1; then
    pacman -S --needed --noconfirm openbox electron xorg-xrandr
elif command -v apt-get >/dev/null 2>&1; then
    apt-get update && apt-get install -y openbox nodejs npm x11-xserver-utils
elif command -v dnf >/dev/null 2>&1; then
    dnf install -y openbox nodejs npm xrandr
elif command -v zypper >/dev/null 2>&1; then
    zypper --non-interactive install openbox nodejs npm xrandr
else
    echo "Unknown package manager. Please install openbox and electron (or nodejs + npm) yourself."
    command -v openbox >/dev/null 2>&1 || exit 1
fi

# Copy the project to /opt/wiidesk (without git data and old node_modules)
mkdir -p /opt/wiidesk
tar -C "$SRC" --exclude=.git --exclude=node_modules -cf - . | tar -C /opt/wiidesk -xf -

# Without a system Electron, install it locally through npm
if ! command -v electron >/dev/null 2>&1; then
    (cd /opt/wiidesk && npm install)
    # Newer npm versions block package install scripts, so run Electron's installer explicitly
    (cd /opt/wiidesk && node node_modules/electron/install.js)
    if [ ! -x /opt/wiidesk/node_modules/electron/dist/electron ]; then
        echo "Electron download failed. Install your distro's electron package or use a Node.js LTS version."
        exit 1
    fi
fi

# Register the session with the display manager (works for X11 sessions on all distros)
install -Dm755 "$SRC/session/wiidesk-session" /usr/local/bin/wiidesk-session
install -Dm644 "$SRC/session/wiidesk.desktop" /usr/share/xsessions/wiidesk.desktop

echo "Done. Please pick the 'WiiDesk' session in your login manager."
