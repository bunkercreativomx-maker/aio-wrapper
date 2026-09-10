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

WrapperOne is such an application (Electron/Chromium embedded). Google **can**
detect Electron when the browser claims to be Chrome.

**What WrapperOne does:** for Google-hosted apps (Gmail, Messages, Drive,
Calendar, Docs, Photos, Meet, Keep) the session presents a **Firefox
User-Agent** instead of a Chrome one. Google's embedded-browser check does not
fire for Firefox, so sign-in works **inside the app**. This is the technique the
Wexond Electron browser uses (https://stackoverflow.com/a/68231284); Ferdium's
maintainers describe UA spoofing as the only consistent workaround for the same
issue. It is a workaround, not a guarantee — Google has changed this detection
before, and if they do again it may need revisiting.

Normal Chrome-UA handling is used for every non-Google app.

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
