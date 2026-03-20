# Desmos Daily

A Chrome extension that gives you a daily graph challenge on [Desmos](https://www.desmos.com/calculator). Open it up, see a target curve, and try to recreate it by writing your own expressions. A progress bar tells you how close you are in real time.


https://github.com/user-attachments/assets/bed9ec86-c1cd-41fb-9300-2844b1a307c3


## Install

1. Go to [Releases](https://github.com/AlexGusew/desmos-daily/releases/latest) and download the zip
2. Unzip it
3. Open `chrome://extensions`, enable **Developer mode**
4. Click **Load unpacked** and select the unzipped folder

## Build from source

```bash
pnpm install
pnpm build:extension
```

The extension will be in `packages/extension/dist/`.
