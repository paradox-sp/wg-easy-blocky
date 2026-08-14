#!/bin/sh
# Entrypoint script for wg-easy-blocky single container
# Sets up configuration files and directories before starting s6-overlay

set -e

echo "Starting wg-easy-blocky container..."

# Create necessary directories
mkdir -p /etc/wireguard /etc/blocky /data/blocky /data/victoriametrics /etc/amnezia

# Symlink for amneziawg compatibility
ln -sf /etc/wireguard /etc/amnezia/amneziawg

# Copy Blocky config template if not already present
if [ ! -f /etc/blocky/config.yml ]; then
    echo "Copying Blocky config template..."
    cp /docker/blocky/config.yml /etc/blocky/config.yml
fi

# Set up iptables legacy
update-alternatives --set iptables /usr/sbin/iptables-legacy 2>/dev/null || true
update-alternatives --set ip6tables /usr/sbin/ip6tables-legacy 2>/dev/null || true

# Set up WireGuard interface if INIT_ENABLED
if [ "${INIT_ENABLED}" = "true" ]; then
    echo "Initializing WireGuard..."
    /usr/local/bin/cli init
fi

# Execute the main command (s6-overlay init)
exec "$@"