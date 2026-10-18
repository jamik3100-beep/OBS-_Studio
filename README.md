# Capture Studio

Capture Studio is a small, browser-based screen and camera recorder. It is an original lightweight recording app, not a copy of OBS Studio.

## Start on Windows

Double-click `start-capture-studio.cmd`. It starts a local-only web server and opens `http://localhost:8765/` in your default browser. Click **Ilovani yuklab olish** on the page to download `Capture-Studio-Windows.zip`; extract the ZIP and run `start-capture-studio.cmd` from the extracted folder to use the app. Keep the hidden server window process running while using the app.

Choose **Ekran**, **Kamera**, or **Ekran + kamera**, choose whether to include your microphone, and press **Yozishni boshlash**. Accept the browser's screen/camera permission prompt. For screen audio, enable the browser's system-audio sharing option if it is available. Press **To‘xtatish** to finish the recording, then press **Videoni saqlash** to download a WebM video.

Recordings are created in the browser and are not uploaded. This first version does not provide live streaming, scenes, filters, or a native installer. Screen recording and microphone access require a modern Chrome- or Edge-based browser.

## Run with PowerShell

From this folder, run:

```powershell
.\start-capture-studio.ps1
```

The launcher serves only the app's static files and downloadable ZIP on `localhost:8765`; it does not expose them to the network. Close the PowerShell server process to stop it.
