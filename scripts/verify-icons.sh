#!/bin/bash
# Verify that required icon files exist for Tauri build

ICONS_DIR="src-tauri/icons"
REQUIRED=("32x32.png" "128x128.png" "icon.icns" "icon.ico" "icon.png")

echo "Checking Tauri build icons..."
all_ok=true
for icon in "${REQUIRED[@]}"; do
    if [ -f "$ICONS_DIR/$icon" ]; then
        size=$(stat -c%s "$ICONS_DIR/$icon" 2>/dev/null || stat -f%z "$ICONS_DIR/$icon" 2>/dev/null)
        echo "  ✓ $icon ($size bytes)"
    else
        echo "  ✗ $icon MISSING"
        all_ok=false
    fi
done

if [ "$all_ok" = true ]; then
    echo "All icons present ✓"
    exit 0
else
    echo "Some icons are missing ✗"
    exit 1
fi
