# Cross-Platform Build Guide

## Prerequisites

### All platforms
- Node.js 18+
- npm
- Rust 1.70+ (via rustup)

### Windows
- Windows 10/11
- Visual Studio Build Tools 2022 (with C++ desktop development workload)
- WebView2 (pre-installed on Windows 10/11)

### macOS
- macOS 12+ (Monterey or later)
- Xcode Command Line Tools (`xcode-select --install`)
- For signing: Apple Developer Program membership

### Linux (Debian/Ubuntu)
```bash
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

### Linux (Fedora/RHEL)
```bash
sudo dnf install \
  webkit2gtk4.1-devel \
  openssl-devel \
  curl \
  wget \
  file \
  libappindicator-gtk3-devel \
  librsvg2-devel
```

## Building

### Development
```bash
npm install
npm run tauri dev
```

### Production build (current platform)
```bash
npm install
npm run tauri build
```

### Build output locations
| Platform | Format | Location |
|----------|--------|----------|
| Windows | .msi | `src-tauri/target/release/bundle/msi/` |
| Windows | .exe (NSIS) | `src-tauri/target/release/bundle/nsis/` |
| macOS | .dmg | `src-tauri/target/release/bundle/dmg/` |
| macOS | .app | `src-tauri/target/release/bundle/macos/` |
| Linux | .deb | `src-tauri/target/release/bundle/deb/` |
| Linux | .rpm | `src-tauri/target/release/bundle/rpm/` |
| Linux | .AppImage | `src-tauri/target/release/bundle/appimage/` |

## Cross-compilation

### From Linux to Windows
```bash
rustup target add x86_64-pc-windows-gnu
# Requires mingw-w64: sudo apt install mingw-w64
cargo tauri build --target x86_64-pc-windows-gnu
```

### From Linux to macOS
Not supported. macOS cross-compilation requires macOS.

## Code Signing (macOS)

For distribution outside your own machine, macOS apps must be signed and notarized:

1. Enroll in Apple Developer Program
2. Create signing certificates in Xcode
3. Set environment variables:
   - `APPLE_CERTIFICATE`: base64-encoded .p12 certificate
   - `APPLE_CERTIFICATE_PASSWORD`: certificate password
   - `APPLE_SIGNING_IDENTITY`: signing identity name
   - `APPLE_ID`: Apple Developer account email
   - `APPLE_PASSWORD`: app-specific password
   - `APPLE_TEAM_ID`: team ID from developer portal

## CI/CD

GitHub Actions workflow is configured at `.github/workflows/release.yml`.
Triggered by git tags (`v*`) or manual workflow dispatch.