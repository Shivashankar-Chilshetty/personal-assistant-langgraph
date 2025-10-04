import { tool } from '@langchain/core/tools';
import { z } from 'zod';

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

export const getEventTool = tool(
    async () => {
        // Google calendar logic goes
        return JSON.stringify([
            {
                title: 'Meeting with Sujoy',
                date: '9th Aug 2025',
                time: '2 PM',
                location: 'Gmeet',
            },
        ]);
    },
    {
        name: 'get-events',
        description: 'Call to get the calendar events.',
        schema: z.object({
            query: z.string().describe('The query to be used to get events from google calender')
        })
    }
);