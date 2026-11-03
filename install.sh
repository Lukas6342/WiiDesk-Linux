#!/bin/sh
# Installs WiiDesk as a desktop session on any Linux distro.
# Usage: sudo ./install.sh
set -e

[ "$(id -u)" -eq 0 ] || { echo "Please run as root: sudo ./install.sh"; exit 1; }

# Without a system Electron, install it locally through npm
install_electron() {
if ! command -v electron >/dev/null 2>&1; then
    (cd /opt/wiidesk && npm install)
    # Newer npm versions block package install scripts, so run Electron's installer explicitly
    (cd /opt/wiidesk && node node_modules/electron/install.js)
    if [ ! -x /opt/wiidesk/node_modules/electron/dist/electron ]; then
        echo "Electron download failed. Install your distro's electron package or use a Node.js LTS version."
        exit 1
    fi
fi
}

# Branch to install (default main): sudo WIIDESK_BRANCH=dev sh install.sh
BRANCH="${WIIDESK_BRANCH:-main}"

# Menu
print_banner() {
cat << 'EOF'
██╗    ██╗██╗██╗██████╗ ███████╗███████╗██╗  ██╗
██║    ██║██║██║██╔══██╗██╔════╝██╔════╝██║ ██╔╝
██║ █╗ ██║██║██║██║  ██║█████╗  ███████╗█████╔╝ 
██║███╗██║██║██║██║  ██║██╔══╝  ╚════██║██╔═██╗ 
╚███╔███╔╝██║██║██████╔╝███████╗███████║██║  ██╗
 ╚══╝╚══╝ ╚═╝╚═╝╚═════╝ ╚══════╝╚══════╝╚═╝  ╚═╝
.                                               
██╗     ██╗███╗   ██╗██╗   ██╗██╗  ██╗          
██║     ██║████╗  ██║██║   ██║╚██╗██╔╝          
██║     ██║██╔██╗ ██║██║   ██║ ╚███╔╝           
██║     ██║██║╚██╗██║██║   ██║ ██╔██╗           
███████╗██║██║ ╚████║╚██████╔╝██╔╝ ██╗          
╚══════╝╚═╝╚═╝  ╚═══╝ ╚═════╝ ╚═╝  ╚═╝          

EOF
}

# Fetch and switch to the wanted branch, then fast-forward it
update_checkout() {
    git -C /opt/wiidesk fetch origin "$BRANCH"
    git -C /opt/wiidesk checkout "$BRANCH"
    git -C /opt/wiidesk pull --ff-only origin "$BRANCH"
}

# Optional: store a Steam API key so the Steam view in the Shop channel can list the whole library.
# It goes into the file WiiDesk reads (~/.config/wiidesk/steam-api-key) of the user who ran sudo.
ask_steam_key() {
    [ -n "$SUDO_USER" ] || return 0
    user_home="$(getent passwd "$SUDO_USER" | cut -d: -f6)"
    [ -n "$user_home" ] || return 0
    key_file="$user_home/.config/wiidesk/steam-api-key"
    [ -e "$key_file" ] && return 0
    echo
    echo "Optional: a Steam API key lists your whole Steam library in WiiDesk."
    echo "Get one for free at https://steamcommunity.com/dev/apikey (domain: localhost)."
    printf "Paste the key here or press Enter to skip: "
    read -r steam_key
    [ -n "$steam_key" ] || return 0
    case "$steam_key" in
        *[!0-9A-Fa-f]*) echo "That does not look like a Steam API key, skipped."; return 0 ;;
    esac
    if [ "${#steam_key}" -ne 32 ]; then
        echo "A Steam API key has 32 characters, skipped."
        return 0
    fi
    mkdir -p "$(dirname "$key_file")"
    printf '%s\n' "$steam_key" > "$key_file"
    chmod 600 "$key_file"
    chown -R "$SUDO_USER" "$user_home/.config/wiidesk" 2>/dev/null || true
    echo "Saved."
}

install_wiidesk() {
clear
print_banner
echo Downloading WiiDesk Linux
if [ -d /opt/wiidesk/.git ]; then
    update_checkout
else
    mkdir -p /opt/wiidesk
    git clone -b "$BRANCH" https://github.com/Lukas6342/WiiDesk-Linux.git /opt/wiidesk
fi
echo Installing
install_electron
register_session
ask_steam_key
echo "Done. Please pick the 'WiiDesk' session in your login manager."
}

# Register the session with the display manager (works for X11 sessions on all distros).
# Always copied from /opt/wiidesk so updates refresh it too.
register_session() {
    echo "Adding the session to your login manager (if you have none, install one with your package manager)"
    install -Dm755 /opt/wiidesk/session/wiidesk-session /usr/local/bin/wiidesk-session
    install -Dm644 /opt/wiidesk/session/wiidesk.desktop /usr/share/xsessions/wiidesk.desktop
}

# Finding PM
if command -v pacman >/dev/null 2>&1; then
    PM=pacman
elif command -v apt >/dev/null 2>&1; then
    PM=apt
elif command -v dnf >/dev/null 2>&1; then
    PM=dnf
elif command -v zypper >/dev/null 2>&1; then
    PM=zypper
else
    echo "Unknown package manager. Please use Option 3 to install."
    command -v openbox >/dev/null 2>&1 || exit 1
fi

#Print Menu
print_banner                                                
echo "1) Install WiiDesk-Linux"
echo "2) Update WiiDesk-Linux"
echo "3) Just Download and copy the data (install dependencies manual) (advanced)"
echo "4) End the Skript"

printf "Please enter a Number [1-4]: "
read -r number
case "$number" in
    1)
        clear
        print_banner
        case "$PM" in
            pacman)
                echo "Installing dependencies via pacman"
                pacman -S --needed --noconfirm openbox electron xorg-xrandr git python-gobject polkit
                pacman -S --needed --noconfirm libpulse networkmanager bluez-utils brightnessctl wmctrl xterm || echo "Could not install the optional system tools (volume, WLAN, Bluetooth, brightness)."
                ;;
            apt)
                echo "Installing dependencies via apt"
                apt update
                apt install -y openbox nodejs npm x11-xserver-utils git python3-gi gir1.2-polkit-1.0
                apt install -y pulseaudio-utils network-manager bluez brightnessctl wmctrl xterm || echo "Could not install the optional system tools (volume, WLAN, Bluetooth, brightness)."
                ;;
            dnf)
                echo "Installing dependencies via dnf"
                dnf install -y openbox nodejs npm xrandr python3-gobject polkit-libs git
                dnf install -y pulseaudio-utils NetworkManager bluez brightnessctl wmctrl xterm || echo "Could not install the optional system tools (volume, WLAN, Bluetooth, brightness)."
                ;;
            zypper)
                echo "Installing dependencies via zypper"
                zypper --non-interactive install openbox nodejs npm xrandr git python3-gobject typelib-1_0-Polkit-1_0
                zypper --non-interactive install pulseaudio-utils NetworkManager bluez brightnessctl wmctrl xterm || echo "Could not install the optional system tools (volume, WLAN, Bluetooth, brightness)."
                ;;
            *)
                echo "We can not find your PM. The installation on your distro might be more complex.."
                echo "Try to install WiiDesk Linux by using Option 3"
                exit 1
                ;;
        esac
        install_wiidesk
        ;;
    2)
        clear
        print_banner
        echo "Updating WiiDesk-Linux..."
        if [ -d "/opt/wiidesk/.git" ]; then
            update_checkout
            install_electron
            register_session
        else
            echo "We cant find your WiiDesk Installation. Please install it."
        fi
        ;;
    3)
        clear
        print_banner
        echo "Please install the following required components manually:"
        echo "  - Window Manager : openbox"
        echo "  - JavaScript / UI: nodejs & npm (or electron)"
        echo "  - Display Tool   : xrandr (xorg-xrandr / x11-xserver-utils)"
        echo "  - Python GI      : python-gobject / python3-gi"
        echo "  - Auth / Polkit  : polkit / gir1.2-polkit-1.0 / polkit-libs"
        echo "  - Tools          : git"
        echo "  - Optional       : pactl (volume), nmcli / NetworkManager (WLAN), bluetoothctl / bluez (Bluetooth), brightnessctl (brightness), wmctrl (closing programs), xterm (debug terminal)"
        printf "Please press Y once you have successfully installed the dependencies; if you encounter any issues, please open an issue on GitHub and include the name of your distribution: "
        read -r input
        case "$input" in
            Y|y)
                install_wiidesk
                ;;
            *)
                echo "Please open an issue on GitHub and include the name of your distribution."
                ;;
        esac
        ;;
    4)
        echo "Ending the Skript"
        exit 0
        ;;
    *)
        echo "Error: Please enter a number between 1 and 4"
        exit 1
        ;;
esac
