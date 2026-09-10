# WrapperOne

All-in-One web workspace: a minimal Electron shell that keeps your web apps
(WhatsApp, Slack, Discord, ChatGPT, …) in one window with a floating dock, one
isolated session per app.

Built for Windows and Linux (Omarchy).

## Features

- Floating dock (Omarchy-style): one tile per web app, orange indicator on the active one.
- Ctrl/Cmd+S: cycle to the next app (works even while a web app has focus).
- Right-click a tile to edit it; the × asks for confirmation before removing.
- One isolated session per app (`persist:<id>`), so logins never collide.
- Real app logo in the top bar, tray and installer.
- Single instance: relaunching restores the existing window.
- Auto-update via GitHub Releases (`latest.yml` / `latest-linux.yml`).

## The Google sign-in limitation (read this)

Google **deliberately blocks** sign-in from browsers that are *"embedded in a
different application"*:

> Google might stop sign-ins from browsers that … Are embedded in a different
> application.
> — https://support.google.com/accounts/answer/7675428

WrapperOne is such an application (Electron/Chromium embedded), so Gmail, Google
Messages and any "Sign in with Google" inside an embedded view will show
*"This browser or app may not be secure"*. This is Google's policy, not a bug —
no User-Agent change, header tweak or Electron upgrade gets around it.

**What WrapperOne does instead:** Google-hosted apps are **not embedded**. They
are handed to your real browser in app mode — the same mechanism Omarchy's own
`omarchy-launch-webapp` uses — where sign-in works and your session already
exists. You'll see a note in the app saying it was opened in your browser.

For everyday Google use on Omarchy, the alternative is installing them as native
web apps: *Install > Web App* in the Omarchy menu.

## Release process

Tag name must equal the version in `package.json` (with a leading `v`):

```sh
# bump "version" in package.json, commit, then:
git tag v1.4.0
git push origin main v1.4.0
```

GitHub Actions builds the Windows installer and the Linux AppImage, uploads them
as artifacts, and a single `publish` job creates **one** release with all assets.
(The build jobs use `--publish never` on purpose: electron-builder's publisher
races into duplicate releases when two platform jobs publish the same tag.)

## Linux / Omarchy install

```sh
mkdir -p ~/Applications && cd ~/Applications
curl -L -o WrapperOne-1.4.0.AppImage \
  https://github.com/bunkercreativomx-maker/aio-wrapper/releases/download/v1.4.0/WrapperOne-1.4.0.AppImage
chmod +x WrapperOne-1.4.0.AppImage

# launcher entry + icon
mkdir -p ~/.local/share/icons/hicolor/512x512/apps
curl -o ~/.local/share/icons/hicolor/512x512/apps/wrapperone.png \
  https://raw.githubusercontent.com/bunkercreativomx-maker/aio-wrapper/main/build/icon.png
gtk-update-icon-cache -f -t ~/.local/share/icons/hicolor 2>/dev/null || true

cat > ~/.local/share/applications/wrapperone.desktop <<EOF
[Desktop Entry]
Name=Wrapper One
Comment=All-in-One web workspace
Exec=$HOME/Applications/WrapperOne-1.4.0.AppImage --no-sandbox
Icon=wrapperone
Terminal=false
Type=Application
Categories=Network;Utility;
StartupWMClass=WrapperOne
EOF
update-desktop-database ~/.local/share/applications 2>/dev/null
```

## Development

```sh
npm ci
npm start      # requires a display
npm run dist   # packaged build
```

## License

MIT
