# ONE SHOT — POS cashier PC setup (NO Node.js)
#
# What you need on the cashier PC:
# 1) Windows + POS-58 USB printer installed
# 2) These 3 files only (copy the whole "scripts" folder):
#      start-xprinter-bridge.bat
#      xprinter-bridge.ps1
#      install-bridge-autostart.ps1
# 3) Your Vercel website open in Chrome/Edge on THE SAME PC

## First time setup

1. Plug POS-58 USB + cash drawer RJ11 into the printer
2. Confirm Windows printer name is exactly: POS-58
3. Copy the project "scripts" folder to the PC, e.g.:
     C:\ONESHOT\scripts\
4. Double-click:
     C:\ONESHOT\scripts\start-xprinter-bridge.bat
5. Keep that black window open
6. Open browser:
     http://127.0.0.1:17809/health
   Must show: "ok": true and printer POS-58

## Make it start after reboot (once)

Right-click PowerShell > Run as administrator, then:

  cd C:\ONESHOT\scripts
  powershell -ExecutionPolicy Bypass -File .\install-bridge-autostart.ps1
  schtasks /Run /TN "ONE-SHOT-XPrinter-Bridge"

## In the Vercel app (same PC)

1. Open your Vercel POS URL
2. Go to Parametres
3. Set:
   - Bridge EN LIGNE
   - Paper 58 mm
   - Printer name POS-58
4. Save
5. Click "Tester le tiroir"
6. POS > pay with Cash

Expected: print without browser popup + drawer opens

## Important

- No Node.js needed on cashier PC
- Bridge must run on the SAME PC as the USB printer
- If browser print popup appears, bridge is offline
