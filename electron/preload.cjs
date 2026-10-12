const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("svrNative", {
  platform: process.platform,
  findRecorderDirs: () => ipcRenderer.invoke("svr:find"),
  pickFolder: () => ipcRenderer.invoke("svr:pick"),
  list: (dir) => ipcRenderer.invoke("svr:list", dir),
  onDrivesChanged: (cb) => ipcRenderer.on("svr:drives-changed", () => cb()),
});
