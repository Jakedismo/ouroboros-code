/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useCallback, useContext } from 'react';
import { MessageType } from '../types.js';
import { allowEditorTypeInSandbox, checkHasEditorType, } from '@ouroboros/code-cli-core';
import { SettingsContext } from '../contexts/SettingsContext.js';
export const useEditorSettings = (setEditorError, addItem) => {
    const [isEditorDialogOpen, setIsEditorDialogOpen] = useState(false);
    const settingsContext = useContext(SettingsContext);
    const openEditorDialog = useCallback(() => {
        setIsEditorDialogOpen(true);
    }, []);
    const handleEditorSelect = useCallback((editorType, scope) => {
        if (editorType &&
            (!checkHasEditorType(editorType) ||
                !allowEditorTypeInSandbox(editorType))) {
            return;
        }
        try {
            settingsContext?.settings.setValue(scope, 'preferredEditor', editorType);
            addItem({
                type: MessageType.INFO,
                text: `Editor preference ${editorType ? `set to "${editorType}"` : 'cleared'} in ${scope} settings.`,
            }, Date.now());
            setEditorError(null);
            setIsEditorDialogOpen(false);
        }
        catch (error) {
            setEditorError(`Failed to set editor preference: ${error}`);
        }
    }, [settingsContext, setEditorError, addItem]);
    const exitEditorDialog = useCallback(() => {
        setIsEditorDialogOpen(false);
    }, []);
    return {
        isEditorDialogOpen,
        openEditorDialog,
        handleEditorSelect,
        exitEditorDialog,
    };
};
//# sourceMappingURL=useEditorSettings.js.map