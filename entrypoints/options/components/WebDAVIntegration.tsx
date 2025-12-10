import React, { useState, useEffect, useRef } from "react";
import { Switch } from "@headlessui/react";
import { browser } from "#imports";
import { t } from "../../../utils/i18n";
import { BROWSER_STORAGE_KEY, CATEGORIES_STORAGE_KEY } from "@/utils/constants";

interface WebDAVIntegrationProps {
  // 不需要额外的props
}

// 定义同步状态的类型
interface SyncStatus {
  id: string;
  status: "in_progress" | "success" | "error";
  startTime?: number;
  completedTime?: number;
  message?: string;
  error?: string;
  success?: boolean;
}

const WebDAVIntegration: React.FC<WebDAVIntegrationProps> = () => {
  const [serverUrl, setServerUrl] = useState<string>("");
  const [username, setUsername] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [syncPath, setSyncPath] = useState<string>("/quick-prompt/prompts.json");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [testMessage, setTestMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [isAutoSyncEnabled, setIsAutoSyncEnabled] = useState<boolean>(false);
  const messageTimeoutRef = useRef<number | null>(null);

  // 新增状态：跟踪同步ID和轮询定时器
  const [currentSyncId, setCurrentSyncId] = useState<string | null>(null);
  const syncCheckIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    loadSettings();
    clearTemporaryMessages();
    return () => {
      if (messageTimeoutRef.current) {
        clearTimeout(messageTimeoutRef.current);
      }
      // 清理轮询定时器
      if (syncCheckIntervalRef.current) {
        clearInterval(syncCheckIntervalRef.current);
      }
    };
  }, []);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const result = await browser.storage.sync.get([
        "webdavServerUrl",
        "webdavUsername",
        "webdavPassword",
        "webdavSyncPath",
        "webdavAutoSyncEnabled",
      ]);
      setServerUrl(result.webdavServerUrl || "");
      setUsername(result.webdavUsername || "");
      setPassword(result.webdavPassword || "");
      setSyncPath(result.webdavSyncPath || "/quick-prompt/prompts.json");
      setIsAutoSyncEnabled(result.webdavAutoSyncEnabled ?? false);
    } catch (error) {
      console.error(t("loadSettingsError"), error);
    } finally {
      setIsLoading(false);
    }
  };

  const clearTemporaryMessages = async () => {
    try {
      console.log('Clearing temporary messages...');
      // 获取所有本地存储的数据
      const allData = await browser.storage.local.get(null);
      const keysToRemove: string[] = [];

      // 查找所有临时消息键和同步状态键
      Object.keys(allData).forEach(key => {
        if (key.startsWith('temp_webdav_message_') || 
            key === 'webdav_sync_status' || 
            key === 'webdav_from_sync_status') {
          keysToRemove.push(key);
        }
      });

      // 删除所有临时消息和同步状态
      if (keysToRemove.length > 0) {
        await browser.storage.local.remove(keysToRemove);
        console.log(`清理了 ${keysToRemove.length} 个临时消息和同步状态`);
      }
    } catch (error) {
      console.error('清理临时消息和同步状态时出错:', error);
    }
  };

  const showMessage = (type: "success" | "error" | "info", text: string) => {
    // 先设置本地状态
    setTestMessage({ type, text });

    if (messageTimeoutRef.current) {
      clearTimeout(messageTimeoutRef.current);
    }

    messageTimeoutRef.current = window.setTimeout(() => {
      setTestMessage(null);
      messageTimeoutRef.current = null;
    }, 5000);

    // 只有成功和错误消息才保存到storage，显示为Toast
    if (type === "success" || type === "error") {
      const statusKey = `temp_webdav_message_${Date.now()}`;
      const statusValue = {
        id: `message_${Date.now()}`,
        status: type === "success" ? "success" : "error",
        message: text,
        completedTime: Date.now(),
      };

      browser.storage.local.set({ [statusKey]: statusValue }).then(() => {
        // 5秒后自动删除临时消息
        setTimeout(() => {
          browser.storage.local.remove(statusKey);
        }, 5000);
      });
    }
  };

  const saveAutoSyncEnabled = async (enabled: boolean) => {
    try {
      await browser.storage.sync.set({ webdavAutoSyncEnabled: enabled });
    } catch (error) {
      console.error("Error saving WebDAV sync setting:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serverUrl || !username || !password) {
      showMessage("error", t("fillWebDAVSettings"));
      return;
    }
    try {
      // 测试连接
      const testResult = await testWebDAVConnection(serverUrl, username, password);

      if (testResult.success) {
        // 保存设置
        await browser.storage.sync.set({
          webdavServerUrl: serverUrl,
          webdavUsername: username,
          webdavPassword: password,
          webdavSyncPath: syncPath,
        });
        showMessage("success", t("connectionSuccessWebDAVSaved"));
      } else {
        showMessage("error", testResult.error || t("testConnectionError"));
      }
    } catch (error) {
      console.error(t("saveSettingsError"), error);
      showMessage("error", t("testConnectionError"));
    }
  };

  const testWebDAVConnection = async (
    url: string,
    user: string,
    pass: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      // 尝试使用 PROPFIND 方法测试连接
      const response = await fetch(url, {
        method: "PROPFIND",
        headers: {
          "Authorization": `Basic ${btoa(`${user}:${pass}`)}`,
          "Depth": "0",
          "Content-Type": "application/xml",
        },
      });
      
      if (response.ok || response.status === 207) {
        console.log(t("webdavConnectionSuccessful"));
        return { success: true };
      } else if (response.status === 401) {
        return {
          success: false,
          error: t("webdavAuthFailed"),
        };
      } else {
        return {
          success: false,
          error: `${t("webdavConnectionFailed")}: ${response.status}`,
        };
      }
    } catch (error: any) {
      console.error(t("testConnectionError"), error);
      return {
        success: false,
        error: error.message || t("testConnectionError"),
      };
    }
  };

  const handleAutoSyncToggle = async (enabled: boolean) => {
    setIsAutoSyncEnabled(enabled);
    await saveAutoSyncEnabled(enabled);
  };

  // 修改startSyncStatusPolling函数
  const startSyncStatusPolling = (syncId: string, storageKey: string) => {
    if (syncCheckIntervalRef.current) {
      clearInterval(syncCheckIntervalRef.current);
    }
    setCurrentSyncId(syncId);

    syncCheckIntervalRef.current = window.setInterval(async () => {
      try {
        const result = (await browser.storage.local.get(storageKey)) as {
          [key: string]: SyncStatus;
        };
        const syncStatus = result[storageKey];

        if (syncStatus && syncStatus.id === syncId) {
          if (
            syncStatus.status === "success" ||
            syncStatus.status === "error"
          ) {
            // 不再显示消息，只清理本地状态
            clearInterval(syncCheckIntervalRef.current!);
            syncCheckIntervalRef.current = null;
            setCurrentSyncId(null);
          } else if (syncStatus.status === "in_progress") {
            console.log(`Sync ID ${syncId} is still in progress...`);
          }
        } else {
          clearInterval(syncCheckIntervalRef.current!);
          syncCheckIntervalRef.current = null;
          setCurrentSyncId(null);
        }
      } catch (error) {
        console.error("Error polling sync status:", error);
        clearInterval(syncCheckIntervalRef.current!);
        syncCheckIntervalRef.current = null;
        setCurrentSyncId(null);
      }
    }, 2000);
  };

  // 同步到 WebDAV
  const handleSyncToWebDAV = async () => {
    if (!serverUrl || !username || !password) {
      showMessage("error", t("webdavNotConfigured"));
      return;
    }

    if (currentSyncId) {
      showMessage("info", t("syncTaskInProgress"));
      return;
    }

    try {
      showMessage("info", t("startingSyncToWebDAV"));
      const syncId = `sync_${Date.now()}`;
      
      // 设置同步状态
      await browser.storage.local.set({
        webdav_sync_status: {
          id: syncId,
          status: "in_progress",
          message: t("syncingToWebDAVMessage"),
          startTime: Date.now(),
        },
      });

      // 获取本地 prompts 数据
      const result = await browser.storage.local.get([BROWSER_STORAGE_KEY, CATEGORIES_STORAGE_KEY]);
      const prompts = result[BROWSER_STORAGE_KEY] || [];
      const categories = result[CATEGORIES_STORAGE_KEY] || [];
      
      // 构建同步数据
      const syncData = {
        version: 1,
        exportedAt: new Date().toISOString(),
        prompts,
        categories,
      };

      // 上传到 WebDAV
      const fullPath = serverUrl.replace(/\/$/, '') + syncPath;
      
      // 先确保目录存在
      const dirPath = syncPath.substring(0, syncPath.lastIndexOf('/'));
      if (dirPath) {
        try {
          await fetch(serverUrl.replace(/\/$/, '') + dirPath, {
            method: "MKCOL",
            headers: {
              "Authorization": `Basic ${btoa(`${username}:${password}`)}`,
            },
          });
        } catch (e) {
          // 目录可能已存在，忽略错误
        }
      }

      const response = await fetch(fullPath, {
        method: "PUT",
        headers: {
          "Authorization": `Basic ${btoa(`${username}:${password}`)}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(syncData, null, 2),
      });

      if (response.ok || response.status === 201 || response.status === 204) {
        await browser.storage.local.set({
          webdav_sync_status: {
            id: syncId,
            status: "success",
            message: t("syncToWebDAVSuccess"),
            completedTime: Date.now(),
          },
        });
        showMessage("success", t("syncToWebDAVSuccess"));
      } else {
        throw new Error(`HTTP ${response.status}`);
      }

      startSyncStatusPolling(syncId, "webdav_sync_status");
    } catch (error: any) {
      console.error("Error syncing to WebDAV:", error);
      showMessage("error", `${t("syncToWebDAVFailed")}: ${error.message}`);
      setCurrentSyncId(null);
    }
  };

  // 从 WebDAV 同步（覆盖模式）
  const handleSyncFromWebDAVReplace = async () => {
    await syncFromWebDAV("replace");
  };

  // 从 WebDAV 同步（追加模式）
  const handleSyncFromWebDAVAppend = async () => {
    await syncFromWebDAV("append");
  };

  const syncFromWebDAV = async (mode: "replace" | "append") => {
    if (!serverUrl || !username || !password) {
      showMessage("error", t("webdavNotConfigured"));
      return;
    }

    if (currentSyncId) {
      showMessage("info", t("syncTaskInProgress"));
      return;
    }

    try {
      const modeText = mode === "replace" ? t("startingWebDAVOverwriteSync") : t("startingWebDAVAppendSync");
      showMessage("info", modeText);
      const syncId = `sync_${Date.now()}`;

      // 设置同步状态
      await browser.storage.local.set({
        webdav_from_sync_status: {
          id: syncId,
          status: "in_progress",
          message: mode === "replace" ? t("syncingFromWebDAVOverwriteMessage") : t("syncingFromWebDAVAppendMessage"),
          startTime: Date.now(),
        },
      });

      // 从 WebDAV 下载数据
      const fullPath = serverUrl.replace(/\/$/, '') + syncPath;
      const response = await fetch(fullPath, {
        method: "GET",
        headers: {
          "Authorization": `Basic ${btoa(`${username}:${password}`)}`,
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(t("webdavFileNotFound"));
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const syncData = await response.json();

      if (!syncData.prompts || !Array.isArray(syncData.prompts)) {
        throw new Error(t("invalidWebDAVDataFormat"));
      }

      if (mode === "replace") {
        // 覆盖模式：直接替换本地数据
        await browser.storage.local.set({
          [BROWSER_STORAGE_KEY]: syncData.prompts,
          [CATEGORIES_STORAGE_KEY]: syncData.categories || [],
        });
      } else {
        // 追加模式：合并数据
        const localResult = await browser.storage.local.get([BROWSER_STORAGE_KEY, CATEGORIES_STORAGE_KEY]);
        const localPrompts = localResult[BROWSER_STORAGE_KEY] || [];
        const localCategories = localResult[CATEGORIES_STORAGE_KEY] || [];

        // 合并 prompts，避免重复
        const localPromptIds = new Set(localPrompts.map((p: any) => p.id));
        const newPrompts = syncData.prompts.filter((p: any) => !localPromptIds.has(p.id));
        const mergedPrompts = [...localPrompts, ...newPrompts];

        // 合并 categories
        const localCategoryIds = new Set(localCategories.map((c: any) => c.id));
        const newCategories = (syncData.categories || []).filter((c: any) => !localCategoryIds.has(c.id));
        const mergedCategories = [...localCategories, ...newCategories];

        await browser.storage.local.set({
          [BROWSER_STORAGE_KEY]: mergedPrompts,
          [CATEGORIES_STORAGE_KEY]: mergedCategories,
        });
      }

      await browser.storage.local.set({
        webdav_from_sync_status: {
          id: syncId,
          status: "success",
          message: t("syncFromWebDAVSuccess"),
          completedTime: Date.now(),
        },
      });
      showMessage("success", t("syncFromWebDAVSuccess"));

      startSyncStatusPolling(syncId, "webdav_from_sync_status");

      // 刷新页面以显示更新的数据
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error: any) {
      console.error("Error syncing from WebDAV:", error);
      showMessage("error", `${t("syncFromWebDAVFailed")}: ${error.message}`);
      setCurrentSyncId(null);
    }
  };

  if (isLoading)
    return (
      <div className="p-4 font-medium text-center animate-pulse">
        {t("loadingWebDAVSettings")}
      </div>
    );

  return (
    <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm border border-white/20 dark:border-gray-700/50 shadow-xl rounded-2xl p-8 mx-auto max-w-6xl">
      {testMessage && (
        <div
          className={`mb-6 p-4 rounded-md border-l-4 shadow-sm ${
            testMessage.type === "success"
              ? "bg-green-50 border-green-500 text-green-800 dark:bg-green-900/30 dark:text-green-200 dark:border-green-500"
              : testMessage.type === "error"
              ? "bg-red-50 border-red-500 text-red-800 dark:bg-red-900/30 dark:text-red-200 dark:border-red-500"
              : "bg-blue-50 border-blue-500 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-500"
          } flex items-center`}
        >
          <span
            className={`mr-2 flex-shrink-0 ${
              testMessage.type === "success"
                ? "text-green-600"
                : testMessage.type === "error"
                ? "text-red-600"
                : "text-blue-600"
            }`}
          >
            {testMessage.type === "success" ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            ) : testMessage.type === "error" ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1V9a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </span>
          <span className="flex-1">{testMessage.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 mb-8 md:grid-cols-3">
        <div className="md:col-span-2 p-6 space-y-5 bg-gray-50/80 dark:bg-gray-700/80 backdrop-blur-sm rounded-xl border border-gray-200/50 dark:border-gray-600/50 shadow-lg">
          <form onSubmit={handleSubmit}>
            <div className="pb-4 mb-4">
              <div className="flex justify-between items-center">
                <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-gray-200">
                  {t("basicSettings")}
                </h3>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <label
                    htmlFor="serverUrl"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    {t("webdavServerUrl")}
                  </label>
                  <input
                    type="url"
                    id="serverUrl"
                    value={serverUrl}
                    onChange={(e) => setServerUrl(e.target.value)}
                    placeholder={t("webdavServerUrlPlaceholder")}
                    required
                    className="block px-3 py-2 mt-1 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                  <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                    {t("webdavServerUrlHelp")}
                  </p>
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="username"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    {t("webdavUsername")}
                  </label>
                  <input
                    type="text"
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={t("webdavUsernamePlaceholder")}
                    required
                    className="block px-3 py-2 mt-1 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    {t("webdavPassword")}
                  </label>
                  <input
                    type="password"
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t("webdavPasswordPlaceholder")}
                    required
                    className="block px-3 py-2 mt-1 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="syncPath"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    {t("webdavSyncPath")}
                  </label>
                  <input
                    type="text"
                    id="syncPath"
                    value={syncPath}
                    onChange={(e) => setSyncPath(e.target.value)}
                    placeholder="/quick-prompt/prompts.json"
                    className="block px-3 py-2 mt-1 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                  <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                    {t("webdavSyncPathHelp")}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                className="flex items-center px-4 py-2 font-medium text-white bg-blue-600/90 dark:bg-blue-500/80 rounded-md transition-colors hover:bg-blue-700 dark:hover:bg-blue-600/90 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
              >
                <svg
                  className="w-4 h-4 mr-1.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                {t("saveSettingsAndTest")}
              </button>
            </div>
          </form>
        </div>

        <div className="flex flex-col p-6 bg-gray-50/80 dark:bg-gray-700/80 backdrop-blur-sm rounded-xl border border-gray-200/50 dark:border-gray-600/50 shadow-lg">
          <h3 className="pb-2 mb-3 text-lg font-semibold text-gray-800 dark:text-gray-200">
            {t("autoSyncSettings")}
          </h3>

          <div className="flex justify-between items-center mb-3">
            <div>
              <h4 className="font-medium text-gray-700 text-md dark:text-gray-300">
                {t("enableAutoSync")}
              </h4>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t("webdavAutoSyncDescription")}
              </p>
            </div>
            <Switch
              checked={isAutoSyncEnabled}
              onChange={handleAutoSyncToggle}
              className={`${
                isAutoSyncEnabled
                  ? "bg-blue-600"
                  : "bg-gray-200 dark:bg-gray-700"
              } 
                relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800`}
            >
              <span className="sr-only">{t("enableSync")}</span>
              <span
                className={`${
                  isAutoSyncEnabled ? "translate-x-6" : "translate-x-1"
                } 
                inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
              />
            </Switch>
          </div>

          <div className="mt-4 p-3 text-xs text-gray-600 bg-white/70 dark:bg-gray-700/70 backdrop-blur-sm rounded-md border border-gray-200/50 dark:border-gray-600/50 shadow-sm dark:text-gray-400">
            <h4 className="mb-2 font-medium text-gray-700 dark:text-gray-300">
              {t("importantNotes")}
            </h4>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>{t("webdavCredentialStorageNote")}</li>
              <li>{t("webdavPermissionsNote")}</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 mb-6 md:grid-cols-2">
        <div className="p-6 bg-indigo-50/80 dark:bg-indigo-900/30 backdrop-blur-sm rounded-xl border border-indigo-200/50 dark:border-indigo-800/50 shadow-lg">
          <div className="flex items-center mb-4">
            <svg
              className="mr-2 w-5 h-5 text-indigo-600 dark:text-indigo-400"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z"
                clipRule="evenodd"
              />
            </svg>
            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
              {t("syncFromWebDAVToLocal")}
            </h4>
          </div>

          <div className="mb-4 space-y-3">
            <button
              type="button"
              onClick={handleSyncFromWebDAVReplace}
              disabled={currentSyncId !== null}
              className="flex justify-center items-center px-4 py-2 w-full font-medium text-white bg-red-600/90 dark:bg-red-500/80 rounded-md transition-colors hover:bg-red-700 dark:hover:bg-red-600/90 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <svg
                className="w-4 h-4 mr-1.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              {t("overwriteLocalData")}
            </button>
            <button
              type="button"
              onClick={handleSyncFromWebDAVAppend}
              disabled={currentSyncId !== null}
              className="flex justify-center items-center px-4 py-2 w-full font-medium text-white bg-blue-600/90 dark:bg-blue-500/80 rounded-md transition-colors hover:bg-blue-700 dark:hover:bg-blue-600/90 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <svg
                className="w-4 h-4 mr-1.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                />
              </svg>
              {t("appendToLocal")}
            </button>
          </div>

          <div className="p-3 text-xs text-gray-600 bg-white/70 dark:bg-gray-700/70 backdrop-blur-sm rounded-md border border-gray-200/50 dark:border-gray-600/50 shadow-sm dark:text-gray-400">
            <div className="mb-1.5">
              <span className="inline-block bg-blue-100 dark:bg-blue-800/60 text-blue-800 dark:text-blue-200 px-1.5 py-0.5 rounded font-semibold text-xs mr-1">
                {t("appendMode")}
              </span>
              {t("appendModeDescription")}
            </div>
            <div className="mb-1.5">
              <span className="inline-block bg-red-100 dark:bg-red-800/60 text-red-800 dark:text-red-200 px-1.5 py-0.5 rounded font-semibold text-xs mr-1">
                {t("overwriteMode")}
              </span>
              {t("overwriteModeDescription")}
            </div>
            <div className="flex items-center mt-2 text-xs font-medium text-red-600 dark:text-red-400">
              <svg
                className="w-3.5 h-3.5 mr-1"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1V9a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              {t("oneTimeOperationNote")}
            </div>
          </div>
        </div>

        <div className="p-6 bg-green-50/80 dark:bg-green-900/30 backdrop-blur-sm rounded-xl border border-green-200/50 dark:border-green-800/50 shadow-lg">
          <div className="flex items-center mb-4">
            <svg
              className="mr-2 w-5 h-5 text-green-600 dark:text-green-400"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z"
                clipRule="evenodd"
              />
            </svg>
            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
              {t("syncFromLocalToWebDAV")}
            </h4>
          </div>

          <div className="mb-4">
            <button
              type="button"
              onClick={handleSyncToWebDAV}
              disabled={currentSyncId !== null}
              className="flex justify-center items-center px-4 py-2 w-full font-medium text-white bg-green-600/90 dark:bg-green-500/80 rounded-md transition-colors hover:bg-green-700 dark:hover:bg-green-600/90 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <svg
                className="w-4 h-4 mr-1.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              {t("syncToWebDAV")}
            </button>
          </div>

          <div className="p-3 text-xs text-gray-600 bg-white/70 dark:bg-gray-700/70 backdrop-blur-sm rounded-md border border-gray-200/50 dark:border-gray-600/50 shadow-sm dark:text-gray-400">
            <div className="mb-2">
              {t("syncToWebDAVDescription")}
            </div>
            <ul className="pl-5 space-y-1 list-disc">
              <li>{t("webdavUploadAllPrompts")}</li>
              <li>{t("webdavUploadAllCategories")}</li>
              <li>{t("webdavOverwriteRemote")}</li>
            </ul>
            <div className="flex items-center mt-2 text-xs font-medium text-red-600 dark:text-red-400">
              <svg
                className="w-3.5 h-3.5 mr-1"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1V9a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              {t("oneTimeOperationNote")}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WebDAVIntegration;

