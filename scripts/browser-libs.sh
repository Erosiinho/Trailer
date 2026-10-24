#!/usr/bin/env sh
# Headless Chromium needs a few system libraries. Without root (containers, code-server),
# this downloads the Debian/Ubuntu packages and unpacks them into .browser-libs/, which
# trailer picks up on its own (LD_LIBRARY_PATH, FONTCONFIG_FILE).
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/.browser-libs"
PACKAGES="libnspr4 libnss3 libglib2.0-0t64 libdbus-1-3 libatk1.0-0t64 libatk-bridge2.0-0t64 libatspi2.0-0t64
  libcups2t64 libavahi-client3 libavahi-common3 libdrm2 libgbm1 libwayland-server0 libxkbcommon0
  libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libxi6 libxrender1 libxcb-render0 libxcb-shm0
  libpango-1.0-0 libpangoft2-1.0-0 libcairo2 libpixman-1-0 libharfbuzz0b libgraphite2-3 libthai0
  libdatrie1 libfribidi0 libfreetype6 libpng16-16t64 libfontconfig1 fontconfig-config fonts-dejavu-core
  fonts-liberation2 libasound2t64"

mkdir -p "$DEST/debs" "$DEST/root" "$DEST/fontcache" "$DEST/apt/lists/partial" "$DEST/apt/cache/archives/partial"
# A private package index: the system one may be stale, and refreshing it needs root.
APT="-o Dir::State::Lists=$DEST/apt/lists -o Dir::Cache=$DEST/apt/cache -o Debug::NoLocking=1"
apt-get $APT update -qq
cd "$DEST/debs"
apt-get $APT download $PACKAGES
for deb in *.deb; do dpkg-deb -x "$deb" "$DEST/root"; done

cat > "$DEST/fonts.conf" <<CONF
<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig>
<dir>$DEST/root/usr/share/fonts</dir><cachedir>$DEST/fontcache</cachedir>
<include ignore_missing="yes">$DEST/root/etc/fonts/conf.d</include></fontconfig>
CONF
echo "Libraries unpacked in $DEST"
