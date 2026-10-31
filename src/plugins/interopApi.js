// @ts-nocheck
import InteropApi from '../ipc-electron/interopApi.js';
import configRepository from '../services/config.js';
import vrcxJsonStorage from '../services/jsonStorage.js';

export async function initInteropApi(isVrOverlay = false) {
    if (isVrOverlay) {
        window.AppApiVr = InteropApi.AppApiVrElectron;
    } else {
        window.AppApi = InteropApi.AppApiElectron;
        window.WebApi = InteropApi.WebApi;
        window.VRCXStorage = InteropApi.VRCXStorage;
        window.SQLite = InteropApi.SQLite;
        window.LogWatcher = InteropApi.LogWatcher;
        window.Discord = InteropApi.Discord;
        window.AssetBundleManager = InteropApi.AssetBundleManager;
        window.AppApiVrElectron = InteropApi.AppApiVrElectron;

        await configRepository.init();
        new vrcxJsonStorage(VRCXStorage);

        AppApi.SetUserAgent();
    }
}
