/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { vi, describe, it, expect, beforeEach, afterEach, } from 'vitest';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import * as fsPromises from 'fs/promises';
import { chatCommand } from './chatCommand.js';
vi.mock('fs/promises', () => ({
    stat: vi.fn(),
    readdir: vi.fn().mockResolvedValue(['file1.txt', 'file2.txt']),
}));
describe('chatCommand', () => {
    const mockFs = fsPromises;
    let mockContext;
    let mockGetChat;
    let mockSaveCheckpoint;
    let mockLoadCheckpoint;
    let mockDeleteCheckpoint;
    let mockGetHistory;
    const getSubCommand = (name) => {
        const subCommand = chatCommand.subCommands?.find((cmd) => cmd.name === name);
        if (!subCommand) {
            throw new Error(`/chat ${name} command not found.`);
        }
        return subCommand;
    };
    beforeEach(() => {
        mockGetHistory = vi.fn().mockReturnValue([]);
        mockGetChat = vi.fn().mockResolvedValue({
            getHistory: mockGetHistory,
        });
        mockSaveCheckpoint = vi.fn().mockResolvedValue(undefined);
        mockLoadCheckpoint = vi.fn().mockResolvedValue([]);
        mockDeleteCheckpoint = vi.fn().mockResolvedValue(true);
        mockContext = createMockCommandContext({
            services: {
                config: {
                    getProjectRoot: () => '/project/root',
                    getGeminiClient: () => ({
                        getChat: mockGetChat,
                    }),
                    storage: {
                        getProjectTempDir: () => '/project/root/.gemini/tmp/mockhash',
                    },
                },
                logger: {
                    saveCheckpoint: mockSaveCheckpoint,
                    loadCheckpoint: mockLoadCheckpoint,
                    deleteCheckpoint: mockDeleteCheckpoint,
                    initialize: vi.fn().mockResolvedValue(undefined),
                },
            },
        });
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });
    it('should have the correct main command definition', () => {
        expect(chatCommand.name).toBe('chat');
        expect(chatCommand.description).toBe('Manage conversation history.');
        expect(chatCommand.subCommands).toHaveLength(4);
    });
    describe('list subcommand', () => {
        let listCommand;
        beforeEach(() => {
            listCommand = getSubCommand('list');
        });
        it('should inform when no checkpoints are found', async () => {
            mockFs.readdir.mockImplementation((async (_) => []));
            const result = await listCommand?.action?.(mockContext, '');
            expect(result).toEqual({
                type: 'message',
                messageType: 'info',
                content: 'No saved conversation checkpoints found.',
            });
        });
        it('should list found checkpoints', async () => {
            const fakeFiles = ['checkpoint-test1.json', 'checkpoint-test2.json'];
            const date = new Date();
            mockFs.readdir.mockImplementation((async (_) => fakeFiles));
            mockFs.stat.mockImplementation((async (path) => {
                if (path.endsWith('test1.json')) {
                    return { mtime: date };
                }
                return { mtime: new Date(date.getTime() + 1000) };
            }));
            const result = (await listCommand?.action?.(mockContext, ''));
            const content = result?.content ?? '';
            expect(result?.type).toBe('message');
            expect(content).toContain('List of saved conversations:');
            const isoDate = date
                .toISOString()
                .match(/(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/);
            const formattedDate = isoDate ? `${isoDate[1]} ${isoDate[2]}` : '';
            expect(content).toContain(formattedDate);
            const index1 = content.indexOf('- \u001b[36mtest1\u001b[0m');
            const index2 = content.indexOf('- \u001b[36mtest2\u001b[0m');
            expect(index1).toBeGreaterThanOrEqual(0);
            expect(index2).toBeGreaterThan(index1);
        });
        it('should handle invalid date formats gracefully', async () => {
            const fakeFiles = ['checkpoint-baddate.json'];
            const badDate = {
                toISOString: () => 'an-invalid-date-string',
            };
            mockFs.readdir.mockResolvedValue(fakeFiles);
            mockFs.stat.mockResolvedValue({ mtime: badDate });
            const result = (await listCommand?.action?.(mockContext, ''));
            const content = result?.content ?? '';
            expect(content).toContain('(saved on Invalid Date)');
        });
    });
    describe('save subcommand', () => {
        let saveCommand;
        const tag = 'my-tag';
        let mockCheckpointExists;
        beforeEach(() => {
            saveCommand = getSubCommand('save');
            mockCheckpointExists = vi.fn().mockResolvedValue(false);
            mockContext.services.logger.checkpointExists = mockCheckpointExists;
        });
        it('should return an error if tag is missing', async () => {
            const result = await saveCommand?.action?.(mockContext, '  ');
            expect(result).toEqual({
                type: 'message',
                messageType: 'error',
                content: 'Missing tag. Usage: /chat save <tag>',
            });
        });
        it('should inform if conversation history is empty or only contains system context', async () => {
            mockGetHistory.mockReturnValue([]);
            let result = await saveCommand?.action?.(mockContext, tag);
            expect(result).toEqual({
                type: 'message',
                messageType: 'info',
                content: 'No conversation found to save.',
            });
            mockGetHistory.mockReturnValue([
                { role: 'user', parts: [{ text: 'context for our chat' }] },
                { role: 'model', parts: [{ text: 'Got it. Thanks for the context!' }] },
            ]);
            result = await saveCommand?.action?.(mockContext, tag);
            expect(result).toEqual({
                type: 'message',
                messageType: 'info',
                content: 'No conversation found to save.',
            });
            mockGetHistory.mockReturnValue([
                { role: 'user', parts: [{ text: 'context for our chat' }] },
                { role: 'model', parts: [{ text: 'Got it. Thanks for the context!' }] },
                { role: 'user', parts: [{ text: 'Hello, how are you?' }] },
            ]);
            result = await saveCommand?.action?.(mockContext, tag);
            expect(result).toEqual({
                type: 'message',
                messageType: 'info',
                content: `Conversation checkpoint saved with tag: ${tag}.`,
            });
        });
        it('should return confirm_action if checkpoint already exists', async () => {
            mockCheckpointExists.mockResolvedValue(true);
            mockContext.invocation = {
                raw: `/chat save ${tag}`,
                name: 'save',
                args: tag,
            };
            const result = await saveCommand?.action?.(mockContext, tag);
            expect(mockCheckpointExists).toHaveBeenCalledWith(tag);
            expect(mockSaveCheckpoint).not.toHaveBeenCalled();
            expect(result).toMatchObject({
                type: 'confirm_action',
                originalInvocation: { raw: `/chat save ${tag}` },
            });
            // Check that prompt is a React element
            expect(result).toHaveProperty('prompt');
        });
        it('should save the conversation if overwrite is confirmed', async () => {
            const history = [
                { role: 'user', parts: [{ text: 'context for our chat' }] },
                { role: 'model', parts: [{ text: 'Got it. Thanks for the context!' }] },
                { role: 'user', parts: [{ text: 'hello' }] },
                { role: 'model', parts: [{ text: 'Hi there!' }] },
            ];
            mockGetHistory.mockReturnValue(history);
            mockContext.overwriteConfirmed = true;
            const result = await saveCommand?.action?.(mockContext, tag);
            expect(mockCheckpointExists).not.toHaveBeenCalled(); // Should skip existence check
            expect(mockSaveCheckpoint).toHaveBeenCalledWith(history, tag);
            expect(result).toEqual({
                type: 'message',
                messageType: 'info',
                content: `Conversation checkpoint saved with tag: ${tag}.`,
            });
        });
    });
    describe('resume subcommand', () => {
        const goodTag = 'good-tag';
        const badTag = 'bad-tag';
        let resumeCommand;
        beforeEach(() => {
            resumeCommand = getSubCommand('resume');
        });
        it('should return an error if tag is missing', async () => {
            const result = await resumeCommand?.action?.(mockContext, '');
            expect(result).toEqual({
                type: 'message',
                messageType: 'error',
                content: 'Missing tag. Usage: /chat resume <tag>',
            });
        });
        it('should inform if checkpoint is not found', async () => {
            mockLoadCheckpoint.mockResolvedValue([]);
            const result = await resumeCommand?.action?.(mockContext, badTag);
            expect(result).toEqual({
                type: 'message',
                messageType: 'info',
                content: `No saved checkpoint found with tag: ${badTag}.`,
            });
        });
        it('should resume a conversation', async () => {
            const conversation = [
                { role: 'user', parts: [{ text: 'hello gemini' }] },
                { role: 'model', parts: [{ text: 'hello world' }] },
            ];
            mockLoadCheckpoint.mockResolvedValue(conversation);
            const result = await resumeCommand?.action?.(mockContext, goodTag);
            expect(result).toEqual({
                type: 'load_history',
                history: [
                    { type: 'user', text: 'hello gemini' },
                    { type: 'gemini', text: 'hello world' },
                ],
                clientHistory: conversation,
            });
        });
        describe('completion', () => {
            it('should provide completion suggestions', async () => {
                const fakeFiles = ['checkpoint-alpha.json', 'checkpoint-beta.json'];
                mockFs.readdir.mockImplementation((async (_) => fakeFiles));
                mockFs.stat.mockImplementation((async (_) => ({
                    mtime: new Date(),
                })));
                const result = await resumeCommand?.completion?.(mockContext, 'a');
                expect(result).toEqual(['alpha']);
            });
            it('should suggest filenames sorted by modified time (newest first)', async () => {
                const fakeFiles = ['checkpoint-test1.json', 'checkpoint-test2.json'];
                const date = new Date();
                mockFs.readdir.mockImplementation((async (_) => fakeFiles));
                mockFs.stat.mockImplementation((async (path) => {
                    if (path.endsWith('test1.json')) {
                        return { mtime: date };
                    }
                    return { mtime: new Date(date.getTime() + 1000) };
                }));
                const result = await resumeCommand?.completion?.(mockContext, '');
                // Sort items by last modified time (newest first)
                expect(result).toEqual(['test2', 'test1']);
            });
        });
    });
    describe('delete subcommand', () => {
        let deleteCommand;
        const tag = 'my-tag';
        beforeEach(() => {
            deleteCommand = getSubCommand('delete');
        });
        it('should return an error if tag is missing', async () => {
            const result = await deleteCommand?.action?.(mockContext, '  ');
            expect(result).toEqual({
                type: 'message',
                messageType: 'error',
                content: 'Missing tag. Usage: /chat delete <tag>',
            });
        });
        it('should return an error if checkpoint is not found', async () => {
            mockDeleteCheckpoint.mockResolvedValue(false);
            const result = await deleteCommand?.action?.(mockContext, tag);
            expect(result).toEqual({
                type: 'message',
                messageType: 'error',
                content: `Error: No checkpoint found with tag '${tag}'.`,
            });
        });
        it('should delete the conversation', async () => {
            const result = await deleteCommand?.action?.(mockContext, tag);
            expect(mockDeleteCheckpoint).toHaveBeenCalledWith(tag);
            expect(result).toEqual({
                type: 'message',
                messageType: 'info',
                content: `Conversation checkpoint '${tag}' has been deleted.`,
            });
        });
        describe('completion', () => {
            it('should provide completion suggestions', async () => {
                const fakeFiles = ['checkpoint-alpha.json', 'checkpoint-beta.json'];
                mockFs.readdir.mockImplementation((async (_) => fakeFiles));
                mockFs.stat.mockImplementation((async (_) => ({
                    mtime: new Date(),
                })));
                const result = await deleteCommand?.completion?.(mockContext, 'a');
                expect(result).toEqual(['alpha']);
            });
        });
    });
});
//# sourceMappingURL=chatCommand.test.js.map