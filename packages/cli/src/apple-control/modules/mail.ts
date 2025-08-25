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
 * Apple Mail management implementation
 */
export class MailManager {

  /**
   * Read recent emails from Apple Mail
   */
  static async readEmails(
    count: number = 10,
    unreadOnly: boolean = true,
    mailbox?: string
  ): Promise<AppleScriptResult> {
    const mailboxCondition = mailbox 
      ? `set targetMailbox to mailbox "${this.escapeString(mailbox)}"`
      : 'set targetMailbox to inbox';

    const unreadCondition = unreadOnly 
      ? 'set emailsList to (messages of targetMailbox whose read status is false)'
      : 'set emailsList to messages of targetMailbox';

    const script = `
tell application "Mail"
    activate
    
    ${mailboxCondition}
    ${unreadCondition}
    
    set output to ""
    set emailCount to count of emailsList
    
    if emailCount is 0 then
        return "No emails found in specified criteria"
    end if
    
    set maxEmails to ${count}
    if emailCount < maxEmails then set maxEmails to emailCount
    
    repeat with i from 1 to maxEmails
        set currentEmail to item i of emailsList
        set emailSubject to subject of currentEmail
        set emailSender to sender of currentEmail
        set emailDate to date received of currentEmail
        set emailContent to content of currentEmail as string
        set readStatus to read status of currentEmail
        
        -- Truncate content for preview
        if (count of emailContent) > 300 then
            set emailPreview to (characters 1 thru 300 of emailContent) as string
            set emailPreview to emailPreview & "..."
        else
            set emailPreview to emailContent
        end if
        
        set readIcon to "📬"
        if readStatus then set readIcon to "📭"
        
        set output to output & "---\\n"
        set output to output & readIcon & " " & emailSubject & "\\n"
        set output to output & "👤 From: " & emailSender & "\\n"
        set output to output & "📅 Date: " & emailDate & "\\n"
        set output to output & "📄 Preview: " & emailPreview & "\\n\\n"
    end repeat
    
    set statusText to ""
    if ${unreadOnly} then
        set statusText to "unread "
    end if
    
    return "Found " & emailCount & " total " & statusText & "emails, showing " & maxEmails & ":\\n\\n" & output
end tell
`;

    return AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.READ_ONLY,
      requiresPrompt: false,
      description: `Reading ${count} ${unreadOnly ? 'unread' : ''} emails from Apple Mail`
    });
  }

  /**
   * Search emails by content, subject, or sender
   */
  static async searchEmails(
    searchTerm: string,
    searchIn: 'all' | 'subject' | 'sender' | 'content' = 'all',
    maxResults: number = 20,
    mailbox?: string
  ): Promise<AppleScriptResult> {
    const mailboxCondition = mailbox 
      ? `set targetMailbox to mailbox "${this.escapeString(mailbox)}"`
      : 'set targetMailbox to inbox';

    // Build search condition based on searchIn parameter
    let searchCondition = '';
    switch (searchIn) {
      case 'subject':
        searchCondition = 'if (subject of currentEmail contains searchTerm) then';
        break;
      case 'sender':
        searchCondition = 'if (sender of currentEmail contains searchTerm) then';
        break;
      case 'content':
        searchCondition = 'if (content of currentEmail as string contains searchTerm) then';
        break;
      default: // 'all'
        searchCondition = `if (subject of currentEmail contains searchTerm) or 
                            (sender of currentEmail contains searchTerm) or 
                            (content of currentEmail as string contains searchTerm) then`;
    }

    const script = `
tell application "Mail"
    activate
    
    set searchTerm to "${this.escapeString(searchTerm)}"
    ${mailboxCondition}
    set matchingEmails to {}
    set output to ""
    
    repeat with currentEmail in messages of targetMailbox
        ${searchCondition}
            set end of matchingEmails to currentEmail
        end if
    end repeat
    
    set foundCount to count of matchingEmails
    
    if foundCount is 0 then
        return "No emails found containing: " & searchTerm
    end if
    
    set maxResults to ${maxResults}
    if foundCount < maxResults then set maxResults to foundCount
    
    repeat with i from 1 to maxResults
        set currentEmail to item i of matchingEmails
        set emailSubject to subject of currentEmail
        set emailSender to sender of currentEmail
        set emailDate to date received of currentEmail
        set emailContent to content of currentEmail as string
        set readStatus to read status of currentEmail
        
        -- Find context around search term
        set contextStart to 1
        try
            set contextStart to (offset of searchTerm in emailContent) - 50
            if contextStart < 1 then set contextStart to 1
        end try
        
        set contextEnd to contextStart + 200
        if contextEnd > (count of emailContent) then set contextEnd to count of emailContent
        
        set emailContext to (characters contextStart thru contextEnd of emailContent) as string
        
        set readIcon to "📬"
        if readStatus then set readIcon to "📭"
        
        set output to output & "---\\n"
        set output to output & readIcon & " " & emailSubject & "\\n"
        set output to output & "👤 From: " & emailSender & "\\n"
        set output to output & "📅 Date: " & emailDate & "\\n"
        set output to output & "🔍 Context: ..." & emailContext & "...\\n\\n"
    end repeat
    
    return "Found " & foundCount & " emails containing '" & searchTerm & "', showing " & maxResults & ":\\n\\n" & output
end tell
`;

    return AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.READ_ONLY,
      requiresPrompt: false,
      description: `Searching emails for "${searchTerm}" in ${searchIn}`
    });
  }

  /**
   * Get detailed information about a specific email
   */
  static async getEmailDetails(emailSubject: string): Promise<AppleScriptResult> {
    const script = `
tell application "Mail"
    activate
    
    set emailSubject to "${this.escapeString(emailSubject)}"
    set foundEmail to null
    
    -- Search for email by subject
    repeat with currentEmail in messages of inbox
        if subject of currentEmail is emailSubject then
            set foundEmail to currentEmail
            exit repeat
        end if
    end repeat
    
    if foundEmail is null then
        return "Error: Email with subject '" & emailSubject & "' not found"
    end if
    
    set emailSender to sender of foundEmail
    set emailRecipients to to recipients of foundEmail
    set emailCCRecipients to cc recipients of foundEmail
    set emailBCCRecipients to bcc recipients of foundEmail
    set emailDate to date received of foundEmail
    set emailContent to content of foundEmail as string
    set readStatus to read status of foundEmail
    set flaggedStatus to flagged status of foundEmail
    set emailSize to size of foundEmail
    set messageId to message id of foundEmail
    
    set recipientList to ""
    repeat with recipient in emailRecipients
        set recipientList to recipientList & (name of recipient) & " <" & (address of recipient) & ">, "
    end repeat
    
    set ccList to ""
    if (count of emailCCRecipients) > 0 then
        repeat with ccRecipient in emailCCRecipients
            set ccList to ccList & (name of ccRecipient) & " <" & (address of ccRecipient) & ">, "
        end repeat
    end if
    
    set readIcon to "📬"
    if readStatus then set readIcon to "📭"
    
    set flagIcon to ""
    if flaggedStatus then set flagIcon to "🚩 "
    
    set output to "📧 Email Details\\n"
    set output to output & "---\\n"
    set output to output & flagIcon & readIcon & " " & emailSubject & "\\n"
    set output to output & "👤 From: " & emailSender & "\\n"
    set output to output & "👥 To: " & recipientList & "\\n"
    if ccList is not "" then
        set output to output & "📋 CC: " & ccList & "\\n"
    end if
    set output to output & "📅 Date: " & emailDate & "\\n"
    set output to output & "📊 Size: " & emailSize & " bytes\\n"
    set output to output & "🆔 Message ID: " & messageId & "\\n\\n"
    set output to output & "📄 Content:\\n" & emailContent
    
    return output
end tell
`;

    return AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.READ_ONLY,
      requiresPrompt: false,
      description: `Getting details for email "${emailSubject}"`
    });
  }

  /**
   * Get summary of recent emails (for AI processing)
   */
  static async summarizeEmails(
    count: number = 5,
    unreadOnly: boolean = true
  ): Promise<AppleScriptResult> {
    const script = `
tell application "Mail"
    activate
    
    set unreadOnly to ${unreadOnly}
    if unreadOnly then
        set emailsList to (messages of inbox whose read status is false)
    else
        set emailsList to messages of inbox
    end if
    
    set output to ""
    set emailCount to count of emailsList
    
    if emailCount is 0 then
        return "No emails found for summarization"
    end if
    
    set maxEmails to ${count}
    if emailCount < maxEmails then set maxEmails to emailCount
    
    set output to "EMAIL SUMMARY for AI Analysis:\\n"
    set output to output & "Total emails to analyze: " & maxEmails & "\\n\\n"
    
    repeat with i from 1 to maxEmails
        set currentEmail to item i of emailsList
        set emailSubject to subject of currentEmail
        set emailSender to sender of currentEmail
        set emailDate to date received of currentEmail
        set emailContent to content of currentEmail as string
        
        -- Extract key content for AI analysis (first 500 chars)
        set contentLength to count of emailContent
        if contentLength > 500 then
            set keyContent to (characters 1 thru 500 of emailContent) as string
        else
            set keyContent to emailContent
        end if
        
        set output to output & "Email " & i & ":\\n"
        set output to output & "Subject: " & emailSubject & "\\n"
        set output to output & "From: " & emailSender & "\\n"
        set output to output & "Date: " & emailDate & "\\n"
        set output to output & "Content: " & keyContent & "\\n"
        set output to output & "---\\n\\n"
    end repeat
    
    return output
end tell
`;

    return AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.READ_ONLY,
      requiresPrompt: false,
      description: `Summarizing ${count} ${unreadOnly ? 'unread' : 'recent'} emails for analysis`
    });
  }

  /**
   * List all mailboxes in Apple Mail
   */
  static async listMailboxes(): Promise<AppleScriptResult> {
    const script = `
tell application "Mail"
    activate
    
    set allMailboxes to mailboxes
    set output to ""
    set mailboxCount to count of allMailboxes
    
    if mailboxCount is 0 then
        return "No mailboxes found"
    end if
    
    repeat with currentMailbox in allMailboxes
        set mailboxName to name of currentMailbox
        set messageCount to count of messages of currentMailbox
        set unreadCount to count of (messages of currentMailbox whose read status is false)
        
        set output to output & "📁 " & mailboxName & " (" & messageCount & " messages, " & unreadCount & " unread)\\n"
    end repeat
    
    return "Found " & mailboxCount & " mailboxes:\\n\\n" & output
end tell
`;

    return AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.READ_ONLY,
      requiresPrompt: false,
      description: 'Listing Mail mailboxes'
    });
  }

  /**
   * Mark emails as read/unread
   */
  static async markEmailsAsRead(
    emailSubjects: string[],
    markAsRead: boolean = true
  ): Promise<AppleScriptResult> {
    const subjectList = emailSubjects.map(subject => `"${this.escapeString(subject)}"`).join(', ');
    
    const script = `
tell application "Mail"
    activate
    
    set targetSubjects to {${subjectList}}
    set modifiedCount to 0
    set output to ""
    
    repeat with targetSubject in targetSubjects
        repeat with currentEmail in messages of inbox
            if subject of currentEmail is targetSubject then
                set read status of currentEmail to ${markAsRead}
                set modifiedCount to modifiedCount + 1
                set output to output & "✅ " & targetSubject & "\\n"
                exit repeat
            end if
        end repeat
    end repeat
    
    set actionText to "read"
    if not ${markAsRead} then set actionText to "unread"
    
    if modifiedCount is 0 then
        return "No matching emails found to mark as " & actionText
    end if
    
    return "Marked " & modifiedCount & " emails as " & actionText & ":\\n\\n" & output
end tell
`;

    return AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.SAFE_WRITE,
      requiresPrompt: false,
      description: `Marking ${emailSubjects.length} emails as ${markAsRead ? 'read' : 'unread'}`
    });
  }

  /**
   * Get unread email count
   */
  static async getUnreadCount(mailbox: string = 'inbox'): Promise<AppleScriptResult> {
    const script = `
tell application "Mail"
    activate
    
    try
        set targetMailbox to mailbox "${this.escapeString(mailbox)}"
        set unreadCount to count of (messages of targetMailbox whose read status is false)
        
        return "📬 Unread emails in " & "${this.escapeString(mailbox)}" & ": " & unreadCount
    on error
        return "Error: Mailbox '${this.escapeString(mailbox)}' not found"
    end try
end tell
`;

    return AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.READ_ONLY,
      requiresPrompt: false,
      description: `Getting unread count for ${mailbox}`
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
 * Register all Mail actions with the action registry
 */
export function registerMailActions(): ActionDefinition[] {
  return [
    {
      id: 'mail:read',
      name: 'Read Mail',
      description: 'Read recent emails from Apple Mail with filtering options',
      category: ActionCategory.MAIL,
      permissionLevel: PermissionLevel.READ_ONLY,
      parameters: [
        {
          name: 'count',
          type: 'number',
          required: false,
          description: 'Number of recent emails to read',
          defaultValue: 10
        },
        {
          name: 'unreadOnly',
          type: 'boolean',
          required: false,
          description: 'Only show unread emails',
          defaultValue: true
        },
        {
          name: 'mailbox',
          type: 'string',
          required: false,
          description: 'Specific mailbox to read from (inbox if not specified)'
        }
      ],
      examples: [
        {
          description: 'Read 5 most recent unread emails',
          input: 'mail:read count=5 unreadOnly=true',
          expectedBehavior: 'Displays the 5 most recent unread emails with previews'
        },
        {
          description: 'Read all emails from specific mailbox',
          input: 'mail:read mailbox="Work" count=10 unreadOnly=false',
          expectedBehavior: 'Shows 10 recent emails from "Work" mailbox regardless of read status'
        }
      ],
      execute: async (context: ActionContext) => {
        const { count = 10, unreadOnly = true, mailbox } = context.parameters;
        return await MailManager.readEmails(count, unreadOnly, mailbox);
      }
    },
    {
      id: 'mail:search',
      name: 'Search Mail',
      description: 'Search emails by content, subject, or sender with context highlighting',
      category: ActionCategory.MAIL,
      permissionLevel: PermissionLevel.READ_ONLY,
      parameters: [
        {
          name: 'query',
          type: 'string',
          required: true,
          description: 'Search term to look for in emails'
        },
        {
          name: 'searchIn',
          type: 'string',
          required: false,
          description: 'Where to search: all, subject, sender, or content',
          defaultValue: 'all'
        },
        {
          name: 'maxResults',
          type: 'number',
          required: false,
          description: 'Maximum number of search results to return',
          defaultValue: 20
        },
        {
          name: 'mailbox',
          type: 'string',
          required: false,
          description: 'Specific mailbox to search in'
        }
      ],
      examples: [
        {
          description: 'Search for project emails',
          input: 'mail:search query="project update" searchIn="subject" maxResults=10',
          expectedBehavior: 'Finds emails with "project update" in the subject line'
        },
        {
          description: 'Search all content for keyword',
          input: 'mail:search query="meeting" searchIn="all"',
          expectedBehavior: 'Searches subject, sender, and content for "meeting"'
        }
      ],
      execute: async (context: ActionContext) => {
        const { query, searchIn = 'all', maxResults = 20, mailbox } = context.parameters;
        
        if (!query) {
          return {
            success: false,
            output: '',
            error: 'Missing required parameter: query is required for search',
            executionTime: 0
          };
        }

        return await MailManager.searchEmails(query, searchIn as any, maxResults, mailbox);
      }
    },
    {
      id: 'mail:summarize',
      name: 'Summarize Mail',
      description: 'Get a summary of recent emails optimized for AI analysis',
      category: ActionCategory.MAIL,
      permissionLevel: PermissionLevel.READ_ONLY,
      parameters: [
        {
          name: 'count',
          type: 'number',
          required: false,
          description: 'Number of emails to include in summary',
          defaultValue: 5
        },
        {
          name: 'unreadOnly',
          type: 'boolean',
          required: false,
          description: 'Only include unread emails in summary',
          defaultValue: true
        }
      ],
      examples: [
        {
          description: 'Summarize recent unread emails',
          input: 'mail:summarize count=10 unreadOnly=true',
          expectedBehavior: 'Provides a structured summary of 10 unread emails for AI analysis'
        }
      ],
      execute: async (context: ActionContext) => {
        const { count = 5, unreadOnly = true } = context.parameters;
        return await MailManager.summarizeEmails(count, unreadOnly);
      }
    },
    {
      id: 'mail:details',
      name: 'Get Email Details',
      description: 'Get detailed information about a specific email including full content',
      category: ActionCategory.MAIL,
      permissionLevel: PermissionLevel.READ_ONLY,
      parameters: [
        {
          name: 'emailSubject',
          type: 'string',
          required: true,
          description: 'Subject of the email to get details for'
        }
      ],
      examples: [
        {
          description: 'Get full details of an email',
          input: 'mail:details emailSubject="Weekly Team Update"',
          expectedBehavior: 'Shows complete email details including sender, recipients, date, and full content'
        }
      ],
      execute: async (context: ActionContext) => {
        const { emailSubject } = context.parameters;
        
        if (!emailSubject) {
          return {
            success: false,
            output: '',
            error: 'Missing required parameter: emailSubject is required',
            executionTime: 0
          };
        }
        
        return await MailManager.getEmailDetails(emailSubject);
      }
    },
    {
      id: 'mail:list-mailboxes',
      name: 'List Mail Mailboxes',
      description: 'List all mailboxes in Apple Mail with message counts',
      category: ActionCategory.MAIL,
      permissionLevel: PermissionLevel.READ_ONLY,
      parameters: [],
      examples: [
        {
          description: 'List all mailboxes',
          input: 'mail:list-mailboxes',
          expectedBehavior: 'Displays all mailboxes with total and unread message counts'
        }
      ],
      execute: async () => {
        return await MailManager.listMailboxes();
      }
    },
    {
      id: 'mail:unread-count',
      name: 'Get Unread Count',
      description: 'Get the number of unread emails in a specific mailbox',
      category: ActionCategory.MAIL,
      permissionLevel: PermissionLevel.READ_ONLY,
      parameters: [
        {
          name: 'mailbox',
          type: 'string',
          required: false,
          description: 'Mailbox to check (inbox if not specified)',
          defaultValue: 'inbox'
        }
      ],
      examples: [
        {
          description: 'Get unread count for inbox',
          input: 'mail:unread-count',
          expectedBehavior: 'Returns the number of unread emails in the inbox'
        },
        {
          description: 'Check specific mailbox',
          input: 'mail:unread-count mailbox="Work"',
          expectedBehavior: 'Shows unread count for the "Work" mailbox'
        }
      ],
      execute: async (context: ActionContext) => {
        const { mailbox = 'inbox' } = context.parameters;
        return await MailManager.getUnreadCount(mailbox);
      }
    },
    {
      id: 'mail:mark-read',
      name: 'Mark Emails as Read',
      description: 'Mark specific emails as read or unread by subject',
      category: ActionCategory.MAIL,
      permissionLevel: PermissionLevel.SAFE_WRITE,
      parameters: [
        {
          name: 'emailSubjects',
          type: 'array',
          required: true,
          description: 'Array of email subjects to mark'
        },
        {
          name: 'markAsRead',
          type: 'boolean',
          required: false,
          description: 'True to mark as read, false to mark as unread',
          defaultValue: true
        }
      ],
      examples: [
        {
          description: 'Mark emails as read',
          input: 'mail:mark-read emailSubjects=["Weekly Report", "Project Update"] markAsRead=true',
          expectedBehavior: 'Marks the specified emails as read'
        }
      ],
      execute: async (context: ActionContext) => {
        const { emailSubjects, markAsRead = true } = context.parameters;
        
        if (!emailSubjects || !Array.isArray(emailSubjects)) {
          return {
            success: false,
            output: '',
            error: 'Missing required parameter: emailSubjects must be an array of email subjects',
            executionTime: 0
          };
        }
        
        return await MailManager.markEmailsAsRead(emailSubjects, markAsRead);
      }
    }
  ];
}