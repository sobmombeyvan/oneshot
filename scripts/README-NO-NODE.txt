ONE SHOT - Cashier PC setup (Windows 7 / 8 / 10 / 11)
=====================================================

NO Node.js needed. Windows + PowerShell only.

WHAT YOU NEED
-------------
1) POS-58 thermal printer connected by USB and installed in Windows
2) Cash drawer cable (RJ11) plugged into the PRINTER (not the PC)
3) These files copied to the PC, for example C:\ONESHOT\scripts\ :
      start-xprinter-bridge.bat
      xprinter-bridge.ps1
      install-bridge-autostart.ps1
4) Google Chrome (recommended) to open the Vercel website


STEP 1 - Check the printer name
-------------------------------
Windows 7:  Start > Devices and Printers
Windows 10: Settings > Printers and scanners

The name must be exactly:  POS-58

If it is different (example XP-58C), remember the exact name.
You will type it in the app later (Parametres > Nom exact imprimante).


STEP 2 - Install the bridge (ONE TIME, as administrator)
--------------------------------------------------------
On Windows 7 this step is required, otherwise the bridge
cannot open its port.

1) Click Start, type: powershell
2) Right-click "Windows PowerShell" > Run as administrator
3) Type these two lines:

      cd C:\ONESHOT\scripts
      powershell -ExecutionPolicy Bypass -File .\install-bridge-autostart.ps1

This does 3 things:
   - reserves the local port for the bridge
   - allows it in the firewall
   - starts the bridge automatically at every Windows logon


STEP 3 - Start the bridge now
-----------------------------
Double-click:   start-xprinter-bridge.bat

A black window opens and shows:

      ONE SHOT printer bridge is RUNNING (no Node.js)
      Printer : POS-58

Leave this window OPEN while the POS is used.

If it says it cannot open the port:
   right-click start-xprinter-bridge.bat > Run as administrator


STEP 4 - Verify
---------------
Open Chrome on the SAME PC and go to:

      http://127.0.0.1:17809/health

You must see something like:

      {"ok":true,"printer":"POS-58","printers":["POS-58", ...]}

Check that your printer appears in the "printers" list.
If the name there is different from POS-58, use that exact name in the app.


STEP 5 - Configure the app
--------------------------
1) Open your Vercel POS website in Chrome on this same PC
2) Press Ctrl+F5 to refresh
3) Go to Parametres
4) Check / set:
      Bridge          = EN LIGNE
      Largeur papier  = 58 mm
      Nom imprimante  = POS-58   (or your exact name)
5) Click Sauvegarder
6) Click "Tester le tiroir"  -> the drawer must open


STEP 6 - Real test
------------------
POS > add products > pay with Cash > confirm

Expected:
   - the ticket prints immediately, with NO browser print popup
   - the text is big and readable
   - the cash drawer opens


AFTER A REBOOT
--------------
The bridge starts by itself (thanks to STEP 2).
Just open the POS website and work.


TROUBLESHOOTING
---------------
Browser print popup appears
   -> the bridge is not running. Start start-xprinter-bridge.bat

"Bridge OFFLINE" in Parametres
   -> open http://127.0.0.1:17809/health to see the real error

"OpenPrinter failed (code 1801)"
   -> the printer name is wrong. Use the exact name from /health

Ticket prints but drawer stays closed
   -> check the RJ11 cable goes into the PRINTER, not the PC
   -> tell the developer: the drawer may need a different pin pulse

Nothing prints at all
   -> print a Windows test page first (Printer properties > Print test page)
      If that fails, it is a driver problem, not the app.
