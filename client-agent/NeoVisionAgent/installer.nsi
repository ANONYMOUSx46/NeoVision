; NeoVision Agent Installer
; Built with NSIS

;--------------------------------
; General settings

Name "NeoVision Remote Support Agent"
OutFile "NeoVisionAgent-Setup.exe"
InstallDir "$PROGRAMFILES64\NeoVision"
InstallDirRegKey HKLM "Software\NeoVision" "Install_Dir"
RequestExecutionLevel admin
SetCompressor lzma

;--------------------------------
; Version info

VIProductVersion "1.0.0.0"
VIAddVersionKey "ProductName"      "NeoVision Remote Support Agent"
VIAddVersionKey "CompanyName"      "NeoVision"
VIAddVersionKey "FileDescription"  "NeoVision Remote Support Agent Installer"
VIAddVersionKey "FileVersion"      "1.0.0"
VIAddVersionKey "LegalCopyright"   "2026 NeoVision"

;--------------------------------
; Pages

!include "MUI2.nsh"

!define MUI_ABORTWARNING
!define MUI_ICON "${NSISDIR}\Contrib\Graphics\Icons\modern-install.ico"
!define MUI_UNICON "${NSISDIR}\Contrib\Graphics\Icons\modern-uninstall.ico"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

;--------------------------------
; Installer section

Section "Install" SecInstall

SetOutPath "$INSTDIR"
File "publish\NeoVisionAgent.exe"
File "config.json"

; Copy config to ProgramData as fallback
CreateDirectory "$COMMONPROGRAMDATA\NeoVision"
CopyFiles "$INSTDIR\config.json" "$COMMONPROGRAMDATA\NeoVision\config.json"

  ; Write install location to registry
  WriteRegStr HKLM "Software\NeoVision" "Install_Dir" "$INSTDIR"

  ; Write uninstaller info to registry (shows in Add/Remove Programs)
  WriteRegStr HKLM \
    "Software\Microsoft\Windows\CurrentVersion\Uninstall\NeoVision" \
    "DisplayName" "NeoVision Remote Support Agent"
  WriteRegStr HKLM \
    "Software\Microsoft\Windows\CurrentVersion\Uninstall\NeoVision" \
    "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKLM \
    "Software\Microsoft\Windows\CurrentVersion\Uninstall\NeoVision" \
    "DisplayVersion" "1.0.0"
  WriteRegStr HKLM \
    "Software\Microsoft\Windows\CurrentVersion\Uninstall\NeoVision" \
    "Publisher" "NeoVision"
  WriteRegDWORD HKLM \
    "Software\Microsoft\Windows\CurrentVersion\Uninstall\NeoVision" \
    "NoModify" 1
  WriteRegDWORD HKLM \
    "Software\Microsoft\Windows\CurrentVersion\Uninstall\NeoVision" \
    "NoRepair" 1

  ; Create uninstaller
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  ; Auto-start agent on Windows login via registry
  WriteRegStr HKLM \
    "Software\Microsoft\Windows\CurrentVersion\Run" \
    "NeoVisionAgent" '"$INSTDIR\NeoVisionAgent.exe"'

  ; Create uninstall batch file for tray menu
  FileOpen $0 "$INSTDIR\uninstall.bat" w
  FileWrite $0 '@echo off$\r$\n'
  FileWrite $0 'taskkill /f /im NeoVisionAgent.exe$\r$\n'
  FileWrite $0 'ping 127.0.0.1 -n 2 > nul$\r$\n'
  FileWrite $0 '"$INSTDIR\Uninstall.exe" /S$\r$\n'
  FileClose $0

  ; Launch the agent immediately after install
  Exec '"$INSTDIR\NeoVisionAgent.exe"'

SectionEnd

;--------------------------------
; Uninstaller section

Section "Uninstall"

  ; Stop the agent
  ExecWait 'taskkill /f /im NeoVisionAgent.exe'

  ; Remove auto-start registry entry
  DeleteRegValue HKLM \
    "Software\Microsoft\Windows\CurrentVersion\Run" \
    "NeoVisionAgent"

  ; Remove uninstall registry entries
  DeleteRegKey HKLM \
    "Software\Microsoft\Windows\CurrentVersion\Uninstall\NeoVision"
  DeleteRegKey HKLM "Software\NeoVision"

  ; Delete installed files
  Delete "$INSTDIR\NeoVisionAgent.exe"
  Delete "$INSTDIR\config.json"
  Delete "$INSTDIR\uninstall.bat"
  Delete "$INSTDIR\Uninstall.exe"
  Delete "$INSTDIR\device.id"
  Delete "$INSTDIR\neovision-agent.log"

  ; Remove install directory
  RMDir "$INSTDIR"

SectionEnd