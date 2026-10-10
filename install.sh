#!/usr/bin/env bash
set -e

UUID="desktop-picture-frame@Abrahamthefirst.github"
DEST="$HOME/.local/share/gnome-shell/extensions/$UUID"

echo "Installing Desktop Picture Frame extension..."

mkdir -p "$DEST"
cp -r metadata.json extension.js prefs.js schemas "$DEST/"

glib-compile-schemas "$DEST/schemas/"

echo "Done. Run the following to enable:"
echo "  gnome-extensions enable $UUID"
echo ""
echo "Then open Extension Manager to configure your image folder."
