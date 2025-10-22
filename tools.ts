import { tool } from '@langchain/core/tools';
import { google } from 'googleapis';
import { z } from 'zod';
import { TavilySearch } from '@langchain/tavily';


// OAuth2 client setup
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URL
);

oauth2Client.setCredentials({
    access_token: process.env.GOOGLE_ACCESS_TOKEN,
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN
});

export const search = new TavilySearch({
    maxResults: 3,
    topic: 'general',
});


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
        //console.log('Create Event Response', response.data);
        // Return structured information so the caller (LLM) can store eventId for later updates
        if (response.status === 200 || response.statusText === 'OK') {
            const created = response.data;
            const result = {
                id: created.id,
                summary: created.summary,
                start: created.start,
                end: created.end,
                hangoutLink: created.hangoutLink || created.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri,
            };
            return JSON.stringify(result);
        }
        return "Couldn't create a meeting.";
    },
    {
        name: 'create-event',
        description: 'Call to create the calendar events.',
        schema: createEventSchema, //expected params type from LLM
    }
);

const updateEventSchema = z.object({
    eventId: z.string().optional(),
    q: z.string().optional(),
    timeMin: z.string().optional(),
    timeMax: z.string().optional(),
    summary: z.string().describe('The title of the event').optional(),
    start: z.object({
        dateTime: z.string().describe('The date time of start of the event.')
        , timeZone: z.string().describe('The IANA timezone string.').optional()
    }).optional(),
    end: z.object({
        dateTime: z.string().describe('The date time of end of the event.'),
        timeZone: z.string().describe('The IANA timezone string.').optional()
    }).optional(),
    attendees: z.array(z.object({
        email: z.string().describe('The email of the attendee'),
        displayName: z.string().describe('Then name of the attendee.'),
    })).optional(),
});

export const updateEventTool = tool(
    async (params) => {
        // Validate/parse input using zod schema
        const data = updateEventSchema.parse(params);
        let { eventId, q, timeMin, timeMax } = data as any;
        // If no eventId provided, try to look up by query/time window
        if (!eventId) {
            if (!q && !timeMin && !timeMax) {
                return 'Please provide eventId or at least a query/time window to find the event.';
            }

            try {
                const listResp = await calendar.events.list({
                    calendarId: 'primary',
                    q,
                    timeMin,
                    timeMax,
                    maxResults: 10,
                });

                const items = listResp.data.items || [];
                if (items.length === 0) {
                    return 'No matching events found for the given query/time window.';
                }
                if (items.length > 1) {
                    // Return concise candidate list for disambiguation
                    const candidates = items.map((it) => ({
                        id: it.id,
                        summary: it.summary,
                        start: it.start,
                        organizer: it.organizer,
                    }));
                    return JSON.stringify({ multipleMatches: true, candidates });
                }

                // Exactly one match
                const first = items[0];
                if (!first || !first.id) {
                    return 'Found an event but it is missing an id.';
                }
                eventId = first.id as string;
            } catch (err: any) {
                console.log('Lookup error', err?.message ?? err);
                return `Failed to search for event: ${err?.message ?? String(err)}`;
            }
        }

        // Build requestBody with provided updatable fields
        const requestBody: any = {};
        if ('summary' in data && data.summary !== undefined) requestBody.summary = data.summary;
        if ('start' in data && data.start !== undefined) requestBody.start = data.start;
        if ('end' in data && data.end !== undefined) requestBody.end = data.end;
        if ('attendees' in data && data.attendees !== undefined) requestBody.attendees = data.attendees;

        if (Object.keys(requestBody).length === 0) {
            return 'Nothing to update. Provide at least one updatable field (summary, start, end, attendees).';
        }

        try {
            const response = await calendar.events.patch({
                calendarId: 'primary',
                eventId,
                sendUpdates: 'all',
                conferenceDataVersion: 1,
                requestBody,
            });

            //console.log('Update Event Response', response.data);
            if (response.status === 200 || response.statusText === 'OK') {
                // Return updated event object so caller can confirm/follow-up
                return JSON.stringify(response.data);
            }

            return "Couldn't update the meeting.";
        } catch (err: any) {
            //console.log('Update event error:', err?.message ?? err);
            return `Failed to update event: ${err?.message ?? String(err)}`;
        }
    },
    {
        name: 'update-event',
        description: 'Call to update the calendar events.',
        schema: updateEventSchema,
    }
);



const deleteEventSchema = z.object({
    eventId: z.string().optional(),
    q: z.string().optional(),
    timeMin: z.string().optional(),
    timeMax: z.string().optional(),
    sendUpdates: z.enum(['all', 'externalOnly', 'none']).optional(),
});

export const deleteEventTool = tool(
    async (params) => {
        const data = deleteEventSchema.parse(params);
        let { eventId, q, timeMin, timeMax, sendUpdates } = data as any;

        // If no eventId provided, try to look up by query/time window
        if (!eventId) {
            if (!q && !timeMin && !timeMax) {
                return 'Please provide eventId or at least a query/time window to find the event to delete.';
            }

            try {
                const listResp = await calendar.events.list({
                    calendarId: 'primary',
                    q,
                    timeMin,
                    timeMax,
                    maxResults: 10,
                });

                const items = listResp.data.items || [];
                if (items.length === 0) {
                    return 'No matching events found for the given query/time window.';
                }
                if (items.length > 1) {
                    const candidates = items.map((it) => ({
                        id: it.id,
                        summary: it.summary,
                        start: it.start,
                        organizer: it.organizer,
                    }));
                    return JSON.stringify({ multipleMatches: true, candidates });
                }

                const first = items[0];
                if (!first || !first.id) {
                    return 'Found an event but it is missing an id.';
                }
                eventId = first.id as string;
            } catch (err: any) {
                //console.log('Lookup error', err?.message ?? err);
                return `Failed to search for event: ${err?.message ?? String(err)}`;
            }
        }

        // Proceed to delete/cancel the event
        try {
            await calendar.events.delete({
                calendarId: 'primary',
                eventId,
                sendUpdates: sendUpdates ?? 'all',
            });

            return JSON.stringify({ deleted: true, id: eventId });
        } catch (err: any) {
            //console.log('Delete error', err?.message ?? err);
            return `Failed to delete event: ${err?.message ?? String(err)}`;
        }
    },
    {
        name: 'delete-event',
        description: 'Call to delete/cancel the calendar event. If attendees exist, sendUpdates controls notifications.',
        schema: deleteEventSchema,
    }
);