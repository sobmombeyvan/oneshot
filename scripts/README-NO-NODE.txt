ONE SHOT - Cashier PC setup (Windows 7 / 8 / 10 / 11)
=====================================================

NO Node.js needed. NO administrator needed. Windows + PowerShell only.


WHAT YOU NEED
-------------
1) POS-58 thermal printer connected by USB and installed in Windows
2) Cash drawer cable (RJ11) plugged into the PRINTER (not the PC)
3) These files copied to the PC, for example C:\ONESHOT\scripts\ :
      start-xprinter-bridge.bat
      stop-bridge.bat
      test-print.bat
      diagnose.bat
      install-autostart.bat
      install-bridge-autostart.ps1
      diagnose.ps1
      xprinter-bridge.ps1
4) Google Chrome (recommended) to open the Vercel website

IMPORTANT: copy the WHOLE scripts folder. If a .ps1 file is missing, the
.bat files close straight away.


STEP 1 - Check the printer name
-------------------------------
Windows 7:  Start > Devices and Printers
Windows 10: Settings > Printers and scanners

The name must be exactly:  POS-58

If it is different (example XP-58C), open start-xprinter-bridge.bat and
test-print.bat with Notepad and change this line in BOTH files:

      set XPRINTER_NAME=POS-58


STEP 2 - Test the printer
-------------------------
Double-click:   test-print.bat

It prints ONE sample ticket and opens the cash drawer.

If it fails, it lists every printer name installed on the PC.
Copy the exact name into the two .bat files (see STEP 1) and try again.

Check the margins on the printed ticket: the text must NOT touch the
left edge of the paper. To change the margin, edit this line in BOTH
start-xprinter-bridge.bat and test-print.bat:

      set XPRINTER_LEFT_PAD=1

0 = no margin, 1 = default, up to 8. Run test-print.bat after each change.

The test ticket contains an amount in the millions (1 500 000) on purpose:
check that it prints in full, on ONE line, with spaces between the groups
of digits and no "?" characters.


STEP 3 - Start the bridge
-------------------------
Double-click:   start-xprinter-bridge.bat

A black window opens and shows:

      ONE SHOT printer bridge is RUNNING (no Node.js, no admin)
      Printer     : POS-58
      Left margin : 1 character
      Health      : http://127.0.0.1:17809/health

Leave this window OPEN (or minimized) while the POS is used.

No UAC prompt, no "run as administrator", no netsh command is needed.
The bridge listens on 127.0.0.1 only, so it is not reachable from
outside the PC.


STEP 4 - Start it automatically at every logon
----------------------------------------------
Double-click:   install-autostart.bat

This puts a small launcher in the Windows Startup folder. After every
reboot the bridge starts by itself, minimized in the taskbar.

To disable it later, delete this file:
      %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\ONE-SHOT-Printer-Bridge.vbs


STEP 5 - Verify
---------------
Open Chrome on the SAME PC and go to:

      http://127.0.0.1:17809/health

You must see something like:

      {"ok":true,"printer":"POS-58","leftPad":1,"printers":["POS-58", ...]}

Check that your printer appears in the "printers" list.


STEP 6 - Configure the app
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


STEP 7 - Real test
------------------
POS > add products > pay with Cash > confirm

Expected:
   - the ticket prints immediately, with NO browser print popup
   - the text is big, readable, and has a left margin
   - the cash drawer opens


TROUBLESHOOTING
---------------
IF ANYTHING GOES WRONG, START HERE
   Double-click diagnose.bat. It writes report.txt next to the scripts:
   Windows version, PowerShell version, whether .NET can open a socket,
   every printer name, and which program is using the port.
   Send report.txt to the developer and the cause is found immediately.

Every print and every error is also written to:  bridge-log.txt

"THE BRIDGE CRASHED"
   -> the reason is shown on screen and saved in bridge-log.txt

"THE BRIDGE DID NOT START" and nothing else
   -> PowerShell closed before the bridge was ready. Run diagnose.bat.

Browser print popup appears
   -> the bridge is not running. Start start-xprinter-bridge.bat
   -> the POS now shows the exact reason in the orange message at the
      top right of the screen. Read it, it says what to fix.

Amounts print as 1?500?000
   -> old version of the app. Press Ctrl+F5 in Chrome to reload it.

"Bridge OFFLINE" in Parametres
   -> open http://127.0.0.1:17809/health in Chrome on that PC

"COULD NOT START THE BRIDGE" / port already used
   -> usually it means the bridge is ALREADY running (autostart). Not a bug.
   -> run stop-bridge.bat, then start-xprinter-bridge.bat if you want to restart.

"OpenPrinter failed (code 1801)"
   -> the printer name is wrong. Run test-print.bat, it lists the real names.

Text touches the paper edge (no margin)
   -> raise XPRINTER_LEFT_PAD (see STEP 2)

Lines are cut on the right, or wrap to the next line
   -> in Parametres, check "Largeur papier" matches your printer
      (58 mm for POS-58, 80 mm for a wide printer)

Ticket prints but drawer stays closed
   -> check the RJ11 cable goes into the PRINTER, not the PC
   -> some drawers need a different pin: tell the developer

Nothing prints at all
   -> print a Windows test page first (Printer properties > Print test page)
      If that fails, it is a driver problem, not the app.
