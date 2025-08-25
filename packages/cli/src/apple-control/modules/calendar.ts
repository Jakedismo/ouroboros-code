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
 * Apple Calendar management implementation
 */
export class CalendarManager {

  /**
   * Create a new event in Apple Calendar
   */
  static async createEvent(
    title: string,
    startDate: string, // YYYY-MM-DD format
    startTime: string = '12:00', // HH:MM format
    duration: number = 60, // minutes
    description?: string,
    location?: string,
    calendar?: string
  ): Promise<AppleScriptResult> {
    // Parse and format the date/time
    const [year, month, day] = startDate.split('-');
    const [hour, minute] = startTime.split(':');

    const calendarCondition = calendar 
      ? `set targetCalendar to calendar "${this.escapeString(calendar)}"`
      : 'set targetCalendar to default calendar';

    const script = `
tell application "Calendar"
    activate
    
    ${calendarCondition}
    
    -- Create the start date
    set startDate to date ("${month}/${day}/${year} ${hour}:${minute}:00")
    
    -- Calculate end date (add duration in minutes)
    set endDate to startDate + (${duration} * minutes)
    
    -- Create the event
    set newEvent to make new event at end of events of targetCalendar
    set summary of newEvent to "${this.escapeString(title)}"
    set start date of newEvent to startDate
    set end date of newEvent to endDate
    
    ${description ? `set description of newEvent to "${this.escapeString(description)}"` : ''}
    ${location ? `set location of newEvent to "${this.escapeString(location)}"` : ''}
    
    return "✅ Created event: " & summary of newEvent & "\\n" & \\
           "📅 Date: " & (start date of newEvent as string) & "\\n" & \\
           "⏰ Duration: ${duration} minutes\\n" & \\
           "📍 Calendar: " & (name of targetCalendar)
end tell
`;

    return AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.SAFE_WRITE,
      requiresPrompt: false,
      description: `Creating calendar event "${title}" on ${startDate} at ${startTime}`
    });
  }

  /**
   * List upcoming events from Apple Calendar
   */
  static async listEvents(
    daysAhead: number = 7,
    calendar?: string,
    maxEvents: number = 20
  ): Promise<AppleScriptResult> {
    const calendarCondition = calendar 
      ? `set targetCalendar to calendar "${this.escapeString(calendar)}"`
      : 'set allCalendars to calendars';

    const calendarEventsCondition = calendar
      ? 'set calendarEvents to events of targetCalendar'
      : `set calendarEvents to {}
         repeat with cal in allCalendars
             set calendarEvents to calendarEvents & events of cal
         end repeat`;

    const script = `
tell application "Calendar"
    activate
    
    set today to current date
    set endDate to today + (${daysAhead} * days)
    
    ${calendarCondition}
    ${calendarEventsCondition}
    
    -- Filter events within date range
    set upcomingEvents to {}
    repeat with evt in calendarEvents
        set eventStart to start date of evt
        if eventStart ≥ today and eventStart ≤ endDate then
            set end of upcomingEvents to evt
        end if
    end repeat
    
    set eventCount to count of upcomingEvents
    
    if eventCount is 0 then
        return "No upcoming events found in the next ${daysAhead} days"
    end if
    
    -- Sort events by start date (simple bubble sort)
    repeat with i from 1 to eventCount - 1
        repeat with j from 1 to eventCount - i
            set event1 to item j of upcomingEvents
            set event2 to item (j + 1) of upcomingEvents
            if start date of event1 > start date of event2 then
                set item j of upcomingEvents to event2
                set item (j + 1) of upcomingEvents to event1
            end if
        end repeat
    end repeat
    
    set output to ""
    set maxEvents to ${maxEvents}
    if eventCount < maxEvents then set maxEvents to eventCount
    
    repeat with i from 1 to maxEvents
        set currentEvent to item i of upcomingEvents
        set eventTitle to summary of currentEvent
        set eventStart to start date of currentEvent
        set eventEnd to end date of currentEvent
        set eventDescription to description of currentEvent
        set eventLocation to location of currentEvent
        set eventCalendar to name of (calendar of currentEvent)
        
        -- Format duration
        set durationSeconds to (eventEnd - eventStart)
        set durationMinutes to (durationSeconds / 60) as integer
        
        set output to output & "---\\n"
        set output to output & "📅 " & eventTitle & "\\n"
        set output to output & "🕐 " & (eventStart as string) & "\\n"
        set output to output & "⏱️  Duration: " & durationMinutes & " minutes\\n"
        
        if eventLocation is not "" then
            set output to output & "📍 Location: " & eventLocation & "\\n"
        end if
        
        set output to output & "📂 Calendar: " & eventCalendar & "\\n"
        
        if eventDescription is not "" and (count of eventDescription) > 0 then
            -- Truncate description
            if (count of eventDescription) > 100 then
                set shortDesc to (characters 1 thru 100 of eventDescription) as string
                set shortDesc to shortDesc & "..."
            else
                set shortDesc to eventDescription
            end if
            set output to output & "📝 " & shortDesc & "\\n"
        end if
        
        set output to output & "\\n"
    end repeat
    
    return "Found " & eventCount & " upcoming events, showing " & maxEvents & ":\\n\\n" & output
end tell
`;

    return AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.READ_ONLY,
      requiresPrompt: false,
      description: `Listing upcoming events for next ${daysAhead} days`
    });
  }

  /**
   * Search for events in Apple Calendar
   */
  static async searchEvents(
    searchTerm: string,
    daysBack: number = 30,
    daysAhead: number = 90,
    maxResults: number = 15
  ): Promise<AppleScriptResult> {
    const script = `
tell application "Calendar"
    activate
    
    set searchTerm to "${this.escapeString(searchTerm)}"
    set today to current date
    set startDate to today - (${daysBack} * days)
    set endDate to today + (${daysAhead} * days)
    
    -- Get all events from all calendars
    set allEvents to {}
    repeat with cal in calendars
        set allEvents to allEvents & events of cal
    end repeat
    
    -- Filter and search events
    set matchingEvents to {}
    repeat with evt in allEvents
        set eventStart to start date of evt
        if eventStart ≥ startDate and eventStart ≤ endDate then
            set eventTitle to summary of evt
            set eventDesc to description of evt
            set eventLocation to location of evt
            
            -- Check if search term appears in title, description, or location
            if (eventTitle contains searchTerm) or \\
               (eventDesc contains searchTerm) or \\
               (eventLocation contains searchTerm) then
                set end of matchingEvents to evt
            end if
        end if
    end repeat
    
    set foundCount to count of matchingEvents
    
    if foundCount is 0 then
        return "No events found containing: " & searchTerm
    end if
    
    set maxResults to ${maxResults}
    if foundCount < maxResults then set maxResults to foundCount
    
    set output to ""
    repeat with i from 1 to maxResults
        set currentEvent to item i of matchingEvents
        set eventTitle to summary of currentEvent
        set eventStart to start date of currentEvent
        set eventEnd to end date of currentEvent
        set eventDescription to description of currentEvent
        set eventLocation to location of currentEvent
        set eventCalendar to name of (calendar of currentEvent)
        
        -- Find context around search term
        set context to ""
        if eventTitle contains searchTerm then
            set context to "Title: " & eventTitle
        else if eventDescription contains searchTerm then
            -- Extract context from description
            try
                set contextStart to (offset of searchTerm in eventDescription) - 30
                if contextStart < 1 then set contextStart to 1
                set contextEnd to contextStart + 100
                if contextEnd > (count of eventDescription) then set contextEnd to count of eventDescription
                set context to "Description: ..." & (characters contextStart thru contextEnd of eventDescription) as string & "..."
            on error
                set context to "Description: " & eventDescription
            end try
        else if eventLocation contains searchTerm then
            set context to "Location: " & eventLocation
        end if
        
        set output to output & "---\\n"
        set output to output & "📅 " & eventTitle & "\\n"
        set output to output & "🕐 " & (eventStart as string) & "\\n"
        set output to output & "📂 Calendar: " & eventCalendar & "\\n"
        if eventLocation is not "" then
            set output to output & "📍 Location: " & eventLocation & "\\n"
        end if
        set output to output & "🔍 Match: " & context & "\\n\\n"
    end repeat
    
    return "Found " & foundCount & " events containing '" & searchTerm & "', showing " & maxResults & ":\\n\\n" & output
end tell
`;

    return AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.READ_ONLY,
      requiresPrompt: false,
      description: `Searching events for "${searchTerm}"`
    });
  }

  /**
   * Get today's events
   */
  static async getTodaysEvents(): Promise<AppleScriptResult> {
    const script = `
tell application "Calendar"
    activate
    
    set today to current date
    set startOfDay to date (short date string of today & " 12:00:00 AM")
    set endOfDay to startOfDay + (1 * days) - (1 * seconds)
    
    -- Get today's events from all calendars
    set todaysEvents to {}
    repeat with cal in calendars
        repeat with evt in events of cal
            set eventStart to start date of evt
            if eventStart ≥ startOfDay and eventStart ≤ endOfDay then
                set end of todaysEvents to evt
            end if
        end repeat
    end repeat
    
    set eventCount to count of todaysEvents
    
    if eventCount is 0 then
        return "📅 No events scheduled for today"
    end if
    
    -- Sort events by start time
    repeat with i from 1 to eventCount - 1
        repeat with j from 1 to eventCount - i
            set event1 to item j of todaysEvents
            set event2 to item (j + 1) of todaysEvents
            if start date of event1 > start date of event2 then
                set item j of todaysEvents to event2
                set item (j + 1) of todaysEvents to event1
            end if
        end repeat
    end repeat
    
    set output to "📅 Today's Schedule (" & eventCount & " events):\\n\\n"
    
    repeat with currentEvent in todaysEvents
        set eventTitle to summary of currentEvent
        set eventStart to start date of currentEvent
        set eventEnd to end date of currentEvent
        set eventLocation to location of currentEvent
        set eventCalendar to name of (calendar of currentEvent)
        
        -- Format time
        set startTime to time string of eventStart
        set endTime to time string of eventEnd
        
        set output to output & "🕐 " & startTime & " - " & endTime & ": " & eventTitle & "\\n"
        
        if eventLocation is not "" then
            set output to output & "   📍 " & eventLocation & "\\n"
        end if
        
        set output to output & "   📂 " & eventCalendar & "\\n\\n"
    end repeat
    
    return output
end tell
`;

    return AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.READ_ONLY,
      requiresPrompt: false,
      description: "Getting today's calendar events"
    });
  }

  /**
   * List all calendars in Apple Calendar
   */
  static async listCalendars(): Promise<AppleScriptResult> {
    const script = `
tell application "Calendar"
    activate
    
    set allCalendars to calendars
    set output to ""
    set calendarCount to count of allCalendars
    
    if calendarCount is 0 then
        return "No calendars found"
    end if
    
    repeat with cal in allCalendars
        set calendarName to name of cal
        set calendarColor to color of cal
        set eventCount to count of events of cal
        
        -- Get upcoming events count (next 30 days)
        set today to current date
        set futureDate to today + (30 * days)
        set upcomingCount to 0
        
        repeat with evt in events of cal
            if start date of evt ≥ today and start date of evt ≤ futureDate then
                set upcomingCount to upcomingCount + 1
            end if
        end repeat
        
        set output to output & "📅 " & calendarName & "\\n"
        set output to output & "   📊 Total events: " & eventCount & "\\n"
        set output to output & "   🔜 Upcoming (30d): " & upcomingCount & "\\n\\n"
    end repeat
    
    return "Found " & calendarCount & " calendars:\\n\\n" & output
end tell
`;

    return AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.READ_ONLY,
      requiresPrompt: false,
      description: 'Listing Calendar calendars'
    });
  }

  /**
   * Delete an event by title and date
   */
  static async deleteEvent(
    eventTitle: string,
    eventDate?: string // YYYY-MM-DD format, optional
  ): Promise<AppleScriptResult> {
    const dateCondition = eventDate 
      ? `and (start date of evt) ≥ (date "${eventDate.replace(/-/g, '/')} 12:00:00 AM") \\
         and (start date of evt) < (date "${eventDate.replace(/-/g, '/')} 12:00:00 AM") + (1 * days)`
      : '';

    const script = `
tell application "Calendar"
    activate
    
    set eventTitle to "${this.escapeString(eventTitle)}"
    set deletedCount to 0
    set output to ""
    
    -- Search through all calendars
    repeat with cal in calendars
        repeat with evt in events of cal
            if (summary of evt) is eventTitle ${dateCondition} then
                set eventStart to start date of evt
                set calendarName to name of cal
                
                delete evt
                set deletedCount to deletedCount + 1
                set output to output & "✅ Deleted: " & eventTitle & "\\n"
                set output to output & "   📅 Date: " & (eventStart as string) & "\\n"
                set output to output & "   📂 Calendar: " & calendarName & "\\n\\n"
            end if
        end repeat
    end repeat
    
    if deletedCount is 0 then
        set searchCriteria to "'" & eventTitle & "'"
        ${eventDate ? `set searchCriteria to searchCriteria & " on ${eventDate}"` : ''}
        return "No events found matching: " & searchCriteria
    end if
    
    return "Deleted " & deletedCount & " event(s):\\n\\n" & output
end tell
`;

    return AppleScriptEngine.execute(script, {
      permissionLevel: PermissionLevel.SAFE_WRITE,
      requiresPrompt: true, // Deletion requires confirmation
      description: `Deleting event "${eventTitle}"${eventDate ? ` on ${eventDate}` : ''}`
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
 * Register all Calendar actions with the action registry
 */
export function registerCalendarActions(): ActionDefinition[] {
  return [
    {
      id: 'calendar:create-event',
      name: 'Create Calendar Event',
      description: 'Create a new event in Apple Calendar with date, time, and details',
      category: ActionCategory.CALENDAR,
      permissionLevel: PermissionLevel.SAFE_WRITE,
      parameters: [
        {
          name: 'title',
          type: 'string',
          required: true,
          description: 'Event title'
        },
        {
          name: 'startDate',
          type: 'string',
          required: true,
          description: 'Event start date in YYYY-MM-DD format'
        },
        {
          name: 'startTime',
          type: 'string',
          required: false,
          description: 'Event start time in HH:MM format',
          defaultValue: '12:00'
        },
        {
          name: 'duration',
          type: 'number',
          required: false,
          description: 'Event duration in minutes',
          defaultValue: 60
        },
        {
          name: 'description',
          type: 'string',
          required: false,
          description: 'Event description or notes'
        },
        {
          name: 'location',
          type: 'string',
          required: false,
          description: 'Event location'
        },
        {
          name: 'calendar',
          type: 'string',
          required: false,
          description: 'Target calendar name (uses default if not specified)'
        }
      ],
      examples: [
        {
          description: 'Create a simple meeting',
          input: 'calendar:create-event title="Team Meeting" startDate="2025-08-26" startTime="14:00" duration=90',
          expectedBehavior: 'Creates a 90-minute team meeting event on August 26th at 2:00 PM'
        },
        {
          description: 'Create event with location',
          input: 'calendar:create-event title="Conference" startDate="2025-09-01" startTime="09:00" location="Convention Center" description="Annual tech conference"',
          expectedBehavior: 'Creates a detailed event with location and description'
        }
      ],
      execute: async (context: ActionContext) => {
        const { 
          title, 
          startDate, 
          startTime = '12:00', 
          duration = 60, 
          description, 
          location, 
          calendar 
        } = context.parameters;
        
        if (!title || !startDate) {
          return {
            success: false,
            output: '',
            error: 'Missing required parameters: title and startDate are required',
            executionTime: 0
          };
        }
        
        // Validate date format
        if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
          return {
            success: false,
            output: '',
            error: 'Invalid date format. Use YYYY-MM-DD (e.g., 2025-08-26)',
            executionTime: 0
          };
        }
        
        // Validate time format
        if (!/^\d{2}:\d{2}$/.test(startTime)) {
          return {
            success: false,
            output: '',
            error: 'Invalid time format. Use HH:MM (e.g., 14:00)',
            executionTime: 0
          };
        }
        
        return await CalendarManager.createEvent(
          title, 
          startDate, 
          startTime, 
          duration, 
          description, 
          location, 
          calendar
        );
      }
    },
    {
      id: 'calendar:list-events',
      name: 'List Calendar Events',
      description: 'List upcoming events from Apple Calendar with date range filtering',
      category: ActionCategory.CALENDAR,
      permissionLevel: PermissionLevel.READ_ONLY,
      parameters: [
        {
          name: 'daysAhead',
          type: 'number',
          required: false,
          description: 'Number of days ahead to show events for',
          defaultValue: 7
        },
        {
          name: 'calendar',
          type: 'string',
          required: false,
          description: 'Specific calendar to list events from (all calendars if not specified)'
        },
        {
          name: 'maxEvents',
          type: 'number',
          required: false,
          description: 'Maximum number of events to return',
          defaultValue: 20
        }
      ],
      examples: [
        {
          description: 'List next week\'s events',
          input: 'calendar:list-events daysAhead=7 maxEvents=10',
          expectedBehavior: 'Shows up to 10 events scheduled for the next 7 days'
        },
        {
          description: 'List work calendar events',
          input: 'calendar:list-events daysAhead=14 calendar="Work"',
          expectedBehavior: 'Shows work-related events for the next 2 weeks'
        }
      ],
      execute: async (context: ActionContext) => {
        const { daysAhead = 7, calendar, maxEvents = 20 } = context.parameters;
        return await CalendarManager.listEvents(daysAhead, calendar, maxEvents);
      }
    },
    {
      id: 'calendar:search-events',
      name: 'Search Calendar Events',
      description: 'Search for events by title, description, or location with flexible date ranges',
      category: ActionCategory.CALENDAR,
      permissionLevel: PermissionLevel.READ_ONLY,
      parameters: [
        {
          name: 'query',
          type: 'string',
          required: true,
          description: 'Search term to look for in event details'
        },
        {
          name: 'daysBack',
          type: 'number',
          required: false,
          description: 'Number of days back to include in search',
          defaultValue: 30
        },
        {
          name: 'daysAhead',
          type: 'number',
          required: false,
          description: 'Number of days ahead to include in search',
          defaultValue: 90
        },
        {
          name: 'maxResults',
          type: 'number',
          required: false,
          description: 'Maximum number of search results to return',
          defaultValue: 15
        }
      ],
      examples: [
        {
          description: 'Search for meeting events',
          input: 'calendar:search-events query="meeting" daysAhead=30',
          expectedBehavior: 'Finds all events containing "meeting" in the next 30 days'
        },
        {
          description: 'Search past and future events',
          input: 'calendar:search-events query="conference" daysBack=60 daysAhead=180',
          expectedBehavior: 'Searches for conference events in a 8-month window'
        }
      ],
      execute: async (context: ActionContext) => {
        const { query, daysBack = 30, daysAhead = 90, maxResults = 15 } = context.parameters;
        
        if (!query) {
          return {
            success: false,
            output: '',
            error: 'Missing required parameter: query is required for search',
            executionTime: 0
          };
        }
        
        return await CalendarManager.searchEvents(query, daysBack, daysAhead, maxResults);
      }
    },
    {
      id: 'calendar:todays-events',
      name: 'Get Today\'s Events',
      description: 'Get a summary of all events scheduled for today',
      category: ActionCategory.CALENDAR,
      permissionLevel: PermissionLevel.READ_ONLY,
      parameters: [],
      examples: [
        {
          description: 'Show today\'s schedule',
          input: 'calendar:todays-events',
          expectedBehavior: 'Displays all events scheduled for today in chronological order'
        }
      ],
      execute: async () => {
        return await CalendarManager.getTodaysEvents();
      }
    },
    {
      id: 'calendar:list-calendars',
      name: 'List Calendars',
      description: 'List all calendars in Apple Calendar with event statistics',
      category: ActionCategory.CALENDAR,
      permissionLevel: PermissionLevel.READ_ONLY,
      parameters: [],
      examples: [
        {
          description: 'List all calendars',
          input: 'calendar:list-calendars',
          expectedBehavior: 'Shows all calendars with total and upcoming event counts'
        }
      ],
      execute: async () => {
        return await CalendarManager.listCalendars();
      }
    },
    {
      id: 'calendar:delete-event',
      name: 'Delete Calendar Event',
      description: 'Delete an event by title and optional date (requires confirmation)',
      category: ActionCategory.CALENDAR,
      permissionLevel: PermissionLevel.SAFE_WRITE,
      parameters: [
        {
          name: 'eventTitle',
          type: 'string',
          required: true,
          description: 'Title of the event to delete'
        },
        {
          name: 'eventDate',
          type: 'string',
          required: false,
          description: 'Specific date of event to delete (YYYY-MM-DD format for precision)'
        }
      ],
      examples: [
        {
          description: 'Delete specific event',
          input: 'calendar:delete-event eventTitle="Old Meeting" eventDate="2025-08-20"',
          expectedBehavior: 'Deletes the "Old Meeting" event on August 20th after confirmation'
        },
        {
          description: 'Delete all events with title',
          input: 'calendar:delete-event eventTitle="Recurring Meeting"',
          expectedBehavior: 'Deletes all events titled "Recurring Meeting" after confirmation'
        }
      ],
      execute: async (context: ActionContext) => {
        const { eventTitle, eventDate } = context.parameters;
        
        if (!eventTitle) {
          return {
            success: false,
            output: '',
            error: 'Missing required parameter: eventTitle is required',
            executionTime: 0
          };
        }
        
        // Validate date format if provided
        if (eventDate && !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
          return {
            success: false,
            output: '',
            error: 'Invalid date format. Use YYYY-MM-DD (e.g., 2025-08-26)',
            executionTime: 0
          };
        }
        
        return await CalendarManager.deleteEvent(eventTitle, eventDate);
      }
    }
  ];
}