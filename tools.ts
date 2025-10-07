import { tool } from '@langchain/core/tools';
import { google } from 'googleapis';
import { z } from 'zod';
import tokens from './tokens.json';

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URL
);

oauth2Client.setCredentials(tokens);

// Create a new Calendar API client.
const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

type Params = {
    q: string;
    timeMin: string;
    timeMax: string;
};

export const getEventTool = tool(
    async (params) => {
        // Google calendar logic goes
        const { q, timeMin, timeMax } = params as Params;
        try {
            // Get the list of events.
            const response = await calendar.events.list({
                calendarId: 'primary',          //If you want to access the primary calendar of the currently logged in user, use the "primary" keyword.
                q: q,
                timeMin,
                timeMax,
                maxResults: 10,
                singleEvents: true,
                orderBy: 'startTime',
            });
            //console.log('Response', response.data); // Log the entire response object to see its structure
            const result = response.data.items?.map((event) => {
                //will send below information from the event to the LLM
                return {
                    id: event.id,
                    summary: event.summary,
                    status: event.status,
                    organiser: event.organizer,
                    start: event.start,
                    end: event.end,
                    attendees: event.attendees,
                    meetingLink: event.hangoutLink,
                    eventType: event.eventType,
                };
            });
            console.log('Events:', result); 
            if (!result || result.length === 0) {
                console.log('No upcoming events found.');
                return 'No upcoming events found.';
            }
            return JSON.stringify(result);
        } catch (err: any) {
            console.log(err.message)
        }
        return 'Failed to connect to the calendar.';
    },
    {
        name: 'get-events',
        description: 'Call to get the calendar events.',
        schema: z.object({
            q: z
                .string()
                .describe(
                    "The query to be used to get events from google calendar. It can be one of these values: summary, description, location, attendees display name, attendees email, organiser's name, organiser's email"
                ),
            timeMin: z.string().describe('The from datetime to get events.'),
            timeMax: z.string().describe('The to datetime to get events.'),
        }),
    }
);

export const createEventTool = tool(
    async () => {
        // Google calendar logic goes
        return 'Meeting has been created';
    },
    {
        name: 'create-event',
        description: 'Call to create a calendar event.',
        schema: z.object({
            query: z.string().describe('The query to be used to create event from google calender')
        })
    }
);

