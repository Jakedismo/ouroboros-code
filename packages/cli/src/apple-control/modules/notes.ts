/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  AppleScriptEngine, 
  AppleScriptResult, 
  PermissionLevel 
} from '../core/applescript-engine.js';
import { 
  ActionContext, 
  ActionDefinition, 
  ActionCategory 
} from '../core/action-registry.js';

/**
 * Apple Notes management implementation
 */
export class NotesManager {
  
  /**
   * Create a new note in Apple Notes
   */
  static async createNote(
    title: string, 
    content: string, 
    folder: string = 'Notes'
  ): Promise<AppleScriptResult> {
    const script = `
tell application "Notes"
    activate
    
    -- Create the note
    set newNote to make new note
    set name of newNote to "${this.escapeString(title)}"
    set body of newNote to "${this.escapeString(content)}"
    
    -- Move to specified folder if it exists
    try
        set targetFolder to folder "${this.escapeString(folder)}"
        move newNote to targetFolder
    on error
        -- Create folder if it doesn't exist
        try
            set newFolder to make new folder
            set name of newFolder to "${this.escapeString(folder)}"
            move newNote to newFolder
        on error
            -- Use default folder if creation fails
        end try
    end try
    
    return "Created note: " & name of newNote & " in folder: " & name of (container of newNote)
end tell
`;

    return AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.SAFE_WRITE,
      requiresPrompt: false,
      description: `Creating note "${title}" in Apple Notes`
    });
  }

  /**
   * Read recent notes from Apple Notes
   */
  static async readNotes(
    count: number = 10,
    folder?: string
  ): Promise<AppleScriptResult> {
    const folderCondition = folder 
      ? `set notesList to notes of folder "${this.escapeString(folder)}"`
      : 'set notesList to notes';

    const script = `
tell application "Notes"
    activate
    
    ${folderCondition}
    set output to ""
    set noteCount to count of notesList
    
    if noteCount is 0 then
        return "No notes found"
    end if
    
    set maxNotes to ${count}
    if noteCount < maxNotes then set maxNotes to noteCount
    
    repeat with i from 1 to maxNotes
        set currentNote to item i of notesList
        set noteTitle to name of currentNote
        set noteBody to body of currentNote
        set noteFolder to name of (container of currentNote)
        set creationDate to creation date of currentNote
        
        -- Truncate body for preview
        if (count of noteBody) > 200 then
            set notePreview to (characters 1 thru 200 of noteBody) as string
            set notePreview to notePreview & "..."
        else
            set notePreview to noteBody
        end if
        
        set output to output & "---\\n"
        set output to output & "📝 " & noteTitle & "\\n"
        set output to output & "📁 Folder: " & noteFolder & "\\n"  
        set output to output & "📅 Created: " & creationDate & "\\n"
        set output to output & "📄 Content: " & notePreview & "\\n\\n"
    end repeat
    
    return "Found " & noteCount & " total notes, showing " & maxNotes & ":\\n\\n" & output
end tell
`;

    return AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.READ_ONLY,
      requiresPrompt: false,
      description: `Reading ${count} recent notes from Apple Notes`
    });
  }

  /**
   * Search notes by content or title
   */
  static async searchNotes(
    searchTerm: string,
    maxResults: number = 20
  ): Promise<AppleScriptResult> {
    const script = `
tell application "Notes"
    activate
    
    set searchTerm to "${this.escapeString(searchTerm)}"
    set matchingNotes to {}
    set output to ""
    
    repeat with currentNote in notes
        set noteTitle to name of currentNote
        set noteBody to body of currentNote
        
        -- Check if search term appears in title or body (case-insensitive)
        if (noteTitle contains searchTerm) or (noteBody contains searchTerm) then
            set end of matchingNotes to currentNote
        end if
    end repeat
    
    set foundCount to count of matchingNotes
    
    if foundCount is 0 then
        return "No notes found containing: " & searchTerm
    end if
    
    set maxResults to ${maxResults}
    if foundCount < maxResults then set maxResults to foundCount
    
    repeat with i from 1 to maxResults
        set currentNote to item i of matchingNotes
        set noteTitle to name of currentNote
        set noteBody to body of currentNote
        set noteFolder to name of (container of currentNote)
        set modificationDate to modification date of currentNote
        
        -- Find and highlight search term context
        set contextStart to 1
        try
            set contextStart to (offset of searchTerm in noteBody) - 50
            if contextStart < 1 then set contextStart to 1
        end try
        
        set contextEnd to contextStart + 200
        if contextEnd > (count of noteBody) then set contextEnd to count of noteBody
        
        set noteContext to (characters contextStart thru contextEnd of noteBody) as string
        
        set output to output & "---\\n"
        set output to output & "📝 " & noteTitle & "\\n"
        set output to output & "📁 Folder: " & noteFolder & "\\n"
        set output to output & "📅 Modified: " & modificationDate & "\\n"
        set output to output & "🔍 Context: ..." & noteContext & "...\\n\\n"
    end repeat
    
    return "Found " & foundCount & " notes containing '" & searchTerm & "', showing " & maxResults & ":\\n\\n" & output
end tell
`;

    return AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.READ_ONLY,
      requiresPrompt: false,
      description: `Searching notes for "${searchTerm}"`
    });
  }

  /**
   * Append content to an existing note
   */
  static async appendToNote(
    noteTitle: string,
    additionalContent: string
  ): Promise<AppleScriptResult> {
    const script = `
tell application "Notes"
    activate
    
    set noteTitle to "${this.escapeString(noteTitle)}"
    set appendContent to "${this.escapeString(additionalContent)}"
    set foundNote to null
    
    -- Find note by title
    repeat with currentNote in notes
        if name of currentNote is noteTitle then
            set foundNote to currentNote
            exit repeat
        end if
    end repeat
    
    if foundNote is null then
        return "Error: Note '" & noteTitle & "' not found"
    end if
    
    -- Append content to the note
    set currentBody to body of foundNote
    set body of foundNote to currentBody & "\\n\\n" & appendContent
    
    return "Successfully appended content to note: " & noteTitle
end tell
`;

    return AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.SAFE_WRITE,
      requiresPrompt: false,
      description: `Appending content to note "${noteTitle}"`
    });
  }

  /**
   * List all folders in Apple Notes
   */
  static async listFolders(): Promise<AppleScriptResult> {
    const script = `
tell application "Notes"
    activate
    
    set folderList to folders
    set output to ""
    set folderCount to count of folderList
    
    if folderCount is 0 then
        return "No folders found in Notes"
    end if
    
    repeat with currentFolder in folderList
        set folderName to name of currentFolder
        set noteCount to count of notes in currentFolder
        set output to output & "📁 " & folderName & " (" & noteCount & " notes)\\n"
    end repeat
    
    return "Found " & folderCount & " folders:\\n\\n" & output
end tell
`;

    return AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.READ_ONLY,
      requiresPrompt: false,
      description: 'Listing Notes folders'
    });
  }

  /**
   * Create a new folder in Apple Notes
   */
  static async createFolder(folderName: string): Promise<AppleScriptResult> {
    const script = `
tell application "Notes"
    activate
    
    set folderName to "${this.escapeString(folderName)}"
    
    -- Check if folder already exists
    repeat with currentFolder in folders
        if name of currentFolder is folderName then
            return "Folder '" & folderName & "' already exists"
        end if
    end repeat
    
    -- Create new folder
    set newFolder to make new folder
    set name of newFolder to folderName
    
    return "Created folder: " & folderName
end tell
`;

    return AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.SAFE_WRITE,
      requiresPrompt: false,
      description: `Creating Notes folder "${folderName}"`
    });
  }

  /**
   * Get detailed information about a specific note
   */
  static async getNoteDetails(noteTitle: string): Promise<AppleScriptResult> {
    const script = `
tell application "Notes"
    activate
    
    set noteTitle to "${this.escapeString(noteTitle)}"
    set foundNote to null
    
    -- Find note by title
    repeat with currentNote in notes
        if name of currentNote is noteTitle then
            set foundNote to currentNote
            exit repeat
        end if
    end repeat
    
    if foundNote is null then
        return "Error: Note '" & noteTitle & "' not found"
    end if
    
    set noteBody to body of foundNote
    set noteFolder to name of (container of foundNote)
    set creationDate to creation date of foundNote
    set modificationDate to modification date of foundNote
    set wordCount to count of words in noteBody
    set charCount to count of characters in noteBody
    
    set output to "📝 Note Details\\n"
    set output to output & "---\\n"
    set output to output & "Title: " & noteTitle & "\\n"
    set output to output & "Folder: " & noteFolder & "\\n"
    set output to output & "Created: " & creationDate & "\\n"
    set output to output & "Modified: " & modificationDate & "\\n"
    set output to output & "Word Count: " & wordCount & "\\n"
    set output to output & "Character Count: " & charCount & "\\n\\n"
    set output to output & "Content:\\n" & noteBody
    
    return output
end tell
`;

    return AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.READ_ONLY,
      requiresPrompt: false,
      description: `Getting details for note "${noteTitle}"`
    });
  }

  /**
   * Escape special characters in AppleScript strings
   */
  private static escapeString(str: string): string {
    return str
      .replace(/\\/g, '\\\\')  // Escape backslashes
      .replace(/"/g, '\\"')     // Escape quotes
      .replace(/\n/g, '\\n')    // Escape newlines
      .replace(/\r/g, '\\r')    // Escape carriage returns
      .replace(/\t/g, '\\t');   // Escape tabs
  }
}

/**
 * Register all Notes actions with the action registry
 */
export function registerNotesActions(): ActionDefinition[] {
  return [
    {
      id: 'notes:create',
      name: 'Create Note',
      description: 'Create a new note in Apple Notes with specified title and content',
      category: ActionCategory.NOTES,
      permissionLevel: PermissionLevel.SAFE_WRITE,
      parameters: [
        {
          name: 'title',
          type: 'string',
          required: true,
          description: 'Title of the note'
        },
        {
          name: 'content',
          type: 'string',
          required: true,
          description: 'Content of the note'
        },
        {
          name: 'folder',
          type: 'string',
          required: false,
          description: 'Folder to create note in (will be created if it doesn\'t exist)',
          defaultValue: 'Notes'
        }
      ],
      examples: [
        {
          description: 'Create a simple meeting note',
          input: 'notes:create title="Daily Standup" content="Discussed sprint progress and blockers"',
          expectedBehavior: 'Creates a new note titled "Daily Standup" in the default Notes folder'
        },
        {
          description: 'Create a note in a specific folder',
          input: 'notes:create title="Code Review" content="Review pull request #123" folder="Work"',
          expectedBehavior: 'Creates a note in the "Work" folder, creating the folder if needed'
        }
      ],
      execute: async (context: ActionContext) => {
        const { title, content, folder = 'Notes' } = context.parameters;
        
        if (!title || !content) {
          return {
            success: false,
            output: '',
            error: 'Missing required parameters: title and content are required',
            executionTime: 0
          };
        }
        
        return await NotesManager.createNote(title, content, folder);
      }
    },
    {
      id: 'notes:read',
      name: 'Read Notes',
      description: 'Read recent notes from Apple Notes with optional folder filtering',
      category: ActionCategory.NOTES,
      permissionLevel: PermissionLevel.READ_ONLY,
      parameters: [
        {
          name: 'count',
          type: 'number',
          required: false,
          description: 'Number of recent notes to read',
          defaultValue: 10
        },
        {
          name: 'folder',
          type: 'string',
          required: false,
          description: 'Specific folder to read from (all folders if not specified)'
        }
      ],
      examples: [
        {
          description: 'Read 5 most recent notes',
          input: 'notes:read count=5',
          expectedBehavior: 'Displays the 5 most recent notes with titles, creation dates, and content previews'
        },
        {
          description: 'Read notes from Work folder',
          input: 'notes:read folder="Work" count=3',
          expectedBehavior: 'Shows 3 most recent notes from the "Work" folder'
        }
      ],
      execute: async (context: ActionContext) => {
        const { count = 10, folder } = context.parameters;
        return await NotesManager.readNotes(count, folder);
      }
    },
    {
      id: 'notes:search',
      name: 'Search Notes',
      description: 'Search notes by content or title with context highlighting',
      category: ActionCategory.NOTES,
      permissionLevel: PermissionLevel.READ_ONLY,
      parameters: [
        {
          name: 'query',
          type: 'string',
          required: true,
          description: 'Search term to look for in note titles and content'
        },
        {
          name: 'maxResults',
          type: 'number',
          required: false,
          description: 'Maximum number of search results to return',
          defaultValue: 20
        }
      ],
      examples: [
        {
          description: 'Search for meeting notes',
          input: 'notes:search query="meeting" maxResults=5',
          expectedBehavior: 'Finds and displays up to 5 notes containing the word "meeting"'
        }
      ],
      execute: async (context: ActionContext) => {
        const { query, maxResults = 20 } = context.parameters;
        
        if (!query) {
          return {
            success: false,
            output: '',
            error: 'Missing required parameter: query is required for search',
            executionTime: 0
          };
        }
        
        return await NotesManager.searchNotes(query, maxResults);
      }
    },
    {
      id: 'notes:append',
      name: 'Append to Note',
      description: 'Append additional content to an existing note',
      category: ActionCategory.NOTES,
      permissionLevel: PermissionLevel.SAFE_WRITE,
      parameters: [
        {
          name: 'noteTitle',
          type: 'string',
          required: true,
          description: 'Title of the existing note to append to'
        },
        {
          name: 'content',
          type: 'string',
          required: true,
          description: 'Content to append to the note'
        }
      ],
      examples: [
        {
          description: 'Add updates to existing note',
          input: 'notes:append noteTitle="Daily Standup" content="Update: Completed user authentication feature"',
          expectedBehavior: 'Appends the update text to the existing "Daily Standup" note'
        }
      ],
      execute: async (context: ActionContext) => {
        const { noteTitle, content } = context.parameters;
        
        if (!noteTitle || !content) {
          return {
            success: false,
            output: '',
            error: 'Missing required parameters: noteTitle and content are required',
            executionTime: 0
          };
        }
        
        return await NotesManager.appendToNote(noteTitle, content);
      }
    },
    {
      id: 'notes:list-folders',
      name: 'List Note Folders',
      description: 'List all folders in Apple Notes with note counts',
      category: ActionCategory.NOTES,
      permissionLevel: PermissionLevel.READ_ONLY,
      parameters: [],
      examples: [
        {
          description: 'List all note folders',
          input: 'notes:list-folders',
          expectedBehavior: 'Displays all folders in Notes with the number of notes in each'
        }
      ],
      execute: async () => {
        return await NotesManager.listFolders();
      }
    },
    {
      id: 'notes:create-folder',
      name: 'Create Note Folder',
      description: 'Create a new folder in Apple Notes',
      category: ActionCategory.NOTES,
      permissionLevel: PermissionLevel.SAFE_WRITE,
      parameters: [
        {
          name: 'folderName',
          type: 'string',
          required: true,
          description: 'Name of the folder to create'
        }
      ],
      examples: [
        {
          description: 'Create a work folder',
          input: 'notes:create-folder folderName="Work Projects"',
          expectedBehavior: 'Creates a new folder called "Work Projects" in Apple Notes'
        }
      ],
      execute: async (context: ActionContext) => {
        const { folderName } = context.parameters;
        
        if (!folderName) {
          return {
            success: false,
            output: '',
            error: 'Missing required parameter: folderName is required',
            executionTime: 0
          };
        }
        
        return await NotesManager.createFolder(folderName);
      }
    },
    {
      id: 'notes:details',
      name: 'Get Note Details',
      description: 'Get detailed information about a specific note including full content',
      category: ActionCategory.NOTES,
      permissionLevel: PermissionLevel.READ_ONLY,
      parameters: [
        {
          name: 'noteTitle',
          type: 'string',
          required: true,
          description: 'Title of the note to get details for'
        }
      ],
      examples: [
        {
          description: 'Get full details of a note',
          input: 'notes:details noteTitle="Meeting Notes"',
          expectedBehavior: 'Shows full details including content, dates, word count, and folder location'
        }
      ],
      execute: async (context: ActionContext) => {
        const { noteTitle } = context.parameters;
        
        if (!noteTitle) {
          return {
            success: false,
            output: '',
            error: 'Missing required parameter: noteTitle is required',
            executionTime: 0
          };
        }
        
        return await NotesManager.getNoteDetails(noteTitle);
      }
    }
  ];
}