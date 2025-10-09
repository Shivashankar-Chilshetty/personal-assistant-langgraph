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
//params type which we will get from the LLM
type Params = {
    q: string;   //query string to search the events based on summary, description, location, attendees display name, attendees email, organiser's name, organiser's email
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
                //singleEvents: true,
                //orderBy: 'startTime',
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
            //console.log('Events:', result);
            if (!result || result.length === 0) {
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

type attendee = {
    email: string;
    displayName: string;
};

const createEventSchema = z.object({
    summary: z.string().describe('The title of the event'),
    start: z.object({
        dateTime: z.string().describe('The date time of start of the event.'),
        timeZone: z.string().describe('Current IANA timezone string.'),
    }),
    end: z.object({
        dateTime: z.string().describe('The date time of end of the event.'),
        timeZone: z.string().describe('Current IANA timezone string.'),
    }),
    attendees: z.array(
        z.object({
            email: z.string().describe('The email of the attendee'),
            displayName: z.string().describe('Then name of the attendee.'),
        })
    ),
});

type EventData = z.infer<typeof createEventSchema>;
// type EventData = {
//     summary: string;
//     start: {
//         dateTime: string;
//         timeZone: string;
//     };
//     end: {
//         dateTime: string;
//         timeZone: string;
//     };
//     attendees: attendee[];
// };

export const createEventTool = tool(
    async (eventData) => {
        const { summary, start, end, attendees } = eventData as EventData;
        // Google calendar logic goes
        const response = await calendar.events.insert({
            calendarId: 'primary',
            sendUpdates: 'all', // Send email notifications to all attendees about the event creation.
            conferenceDataVersion: 1, // Enable conference data (attaches Google Meet link to the calendar event)
            requestBody: {
                summary,
                start,
                end,
                attendees,
                conferenceData: {         // To create a Google Meet link
                    createRequest: {
                        requestId: crypto.randomUUID(),
                        conferenceSolutionKey: {
                            type: 'hangoutsMeet', // Google Meet
                        },
                    },
                },
            },
        });
        console.log('Create Event Response', response.data);
        if (response.statusText === 'OK') {
            return 'The meeting has been created.';
        }

        return "Couldn't create a meeting.";
    },
    {
        name: 'create-event',
        description: 'Call to create the calendar events.',
        schema: createEventSchema, //expected params type from LLM
    }
);

