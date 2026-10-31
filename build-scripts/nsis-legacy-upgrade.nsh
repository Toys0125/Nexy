; Electron Builder custom install macro.
; The former CefSharp installer used its own HKLM uninstall key and Uninstall.exe,
; rather than Electron Builder's application-ID-based uninstall registration.
; Do not run the old uninstaller after extracting the new files: it would delete
; Nexy's newly installed Electron executable and resources.
!macro customInstall
  ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Nexy" "InstallLocation"
  ${If} $R0 == "$INSTDIR"
    DetailPrint "Removing legacy CefSharp installer registration and binaries"
    Delete "$INSTDIR\Uninstall.exe"
    Delete "$INSTDIR\CefSharp*.dll"
    Delete "$INSTDIR\libcef.dll"
    Delete "$INSTDIR\chrome_elf.dll"
    Delete "$INSTDIR\CefSharp.BrowserSubprocess.exe"
    DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Nexy"
    DeleteRegKey HKLM "Software\Nexy"
  ${EndIf}
!macroend
