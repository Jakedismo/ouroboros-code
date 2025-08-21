/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { DetectedIde, GEMINI_CLI_COMPANION_EXTENSION_NAME, IDEConnectionStatus, getIdeInfo, getIdeInstaller, ideContext, } from '@ouroboros/code-cli-core';
import path from 'node:path';
import { CommandKind, } from './types.js';
import { SettingScope } from '../../config/settings.js';
function getIdeStatusMessage(ideClient) {
    const connection = ideClient.getConnectionStatus();
    switch (connection.status) {
        case IDEConnectionStatus.Connected:
            return {
                messageType: 'info',
                content: `🟢 Connected to ${ideClient.getDetectedIdeDisplayName()}`,
            };
        case IDEConnectionStatus.Connecting:
            return {
                messageType: 'info',
                content: `🟡 Connecting...`,
            };
        default: {
            let content = `🔴 Disconnected`;
            if (connection?.details) {
                content += `: ${connection.details}`;
            }
            return {
                messageType: 'error',
                content,
            };
        }
    }
}
function formatFileList(openFiles) {
    const basenameCounts = new Map();
    for (const file of openFiles) {
        const basename = path.basename(file.path);
        basenameCounts.set(basename, (basenameCounts.get(basename) || 0) + 1);
    }
    const fileList = openFiles
        .map((file) => {
        const basename = path.basename(file.path);
        const isDuplicate = (basenameCounts.get(basename) || 0) > 1;
        const parentDir = path.basename(path.dirname(file.path));
        const displayName = isDuplicate
            ? `${basename} (/${parentDir})`
            : basename;
        return `  - ${displayName}${file.isActive ? ' (active)' : ''}`;
    })
        .join('\n');
    const infoMessage = `
(Note: The file list is limited to a number of recently accessed files within your workspace and only includes local files on disk)`;
    return `\n\nOpen files:\n${fileList}\n${infoMessage}`;
}
async function getIdeStatusMessageWithFiles(ideClient) {
    const connection = ideClient.getConnectionStatus();
    switch (connection.status) {
        case IDEConnectionStatus.Connected: {
            let content = `🟢 Connected to ${ideClient.getDetectedIdeDisplayName()}`;
            const context = ideContext.getIdeContext();
            const openFiles = context?.workspaceState?.openFiles;
            if (openFiles && openFiles.length > 0) {
                content += formatFileList(openFiles);
            }
            return {
                messageType: 'info',
                content,
            };
        }
        case IDEConnectionStatus.Connecting:
            return {
                messageType: 'info',
                content: `🟡 Connecting...`,
            };
        default: {
            let content = `🔴 Disconnected`;
            if (connection?.details) {
                content += `: ${connection.details}`;
            }
            return {
                messageType: 'error',
                content,
            };
        }
    }
}
export const ideCommand = (config) => {
    if (!config) {
        return null;
    }
    const ideClient = config.getIdeClient();
    const currentIDE = ideClient.getCurrentIde();
    if (!currentIDE || !ideClient.getDetectedIdeDisplayName()) {
        return {
            name: 'ide',
            description: 'manage IDE integration',
            kind: CommandKind.BUILT_IN,
            action: () => ({
                type: 'message',
                messageType: 'error',
                content: `IDE integration is not supported in your current environment. To use this feature, run Gemini CLI in one of these supported IDEs: ${Object.values(DetectedIde)
                    .map((ide) => getIdeInfo(ide).displayName)
                    .join(', ')}`,
            }),
        };
    }
    const ideSlashCommand = {
        name: 'ide',
        description: 'manage IDE integration',
        kind: CommandKind.BUILT_IN,
        subCommands: [],
    };
    const statusCommand = {
        name: 'status',
        description: 'check status of IDE integration',
        kind: CommandKind.BUILT_IN,
        action: async () => {
            const { messageType, content } = await getIdeStatusMessageWithFiles(ideClient);
            return {
                type: 'message',
                messageType,
                content,
            };
        },
    };
    const installCommand = {
        name: 'install',
        description: `install required IDE companion for ${ideClient.getDetectedIdeDisplayName()}`,
        kind: CommandKind.BUILT_IN,
        action: async (context) => {
            const installer = getIdeInstaller(currentIDE);
            if (!installer) {
                context.ui.addItem({
                    type: 'error',
                    text: `No installer is available for ${ideClient.getDetectedIdeDisplayName()}. Please install the '${GEMINI_CLI_COMPANION_EXTENSION_NAME}' extension manually from the marketplace.`,
                }, Date.now());
                return;
            }
            context.ui.addItem({
                type: 'info',
                text: `Installing IDE companion...`,
            }, Date.now());
            const result = await installer.install();
            if (result.success) {
                config.setIdeMode(true);
                context.services.settings.setValue(SettingScope.User, 'ideMode', true);
            }
            context.ui.addItem({
                type: result.success ? 'info' : 'error',
                text: result.message,
            }, Date.now());
        },
    };
    const enableCommand = {
        name: 'enable',
        description: 'enable IDE integration',
        kind: CommandKind.BUILT_IN,
        action: async (context) => {
            context.services.settings.setValue(SettingScope.User, 'ideMode', true);
            await config.setIdeModeAndSyncConnection(true);
            const { messageType, content } = getIdeStatusMessage(ideClient);
            context.ui.addItem({
                type: messageType,
                text: content,
            }, Date.now());
        },
    };
    const disableCommand = {
        name: 'disable',
        description: 'disable IDE integration',
        kind: CommandKind.BUILT_IN,
        action: async (context) => {
            context.services.settings.setValue(SettingScope.User, 'ideMode', false);
            await config.setIdeModeAndSyncConnection(false);
            const { messageType, content } = getIdeStatusMessage(ideClient);
            context.ui.addItem({
                type: messageType,
                text: content,
            }, Date.now());
        },
    };
    const { status } = ideClient.getConnectionStatus();
    const isConnected = status === IDEConnectionStatus.Connected;
    if (isConnected) {
        ideSlashCommand.subCommands = [statusCommand, disableCommand];
    }
    else {
        ideSlashCommand.subCommands = [
            enableCommand,
            statusCommand,
            installCommand,
        ];
    }
    return ideSlashCommand;
};
//# sourceMappingURL=ideCommand.js.map