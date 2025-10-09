import readline from 'node:readline/promises';
import { ChatGroq } from "@langchain/groq";
import { createEventTool, getEventTool, search } from "./tools";
import { END, MemorySaver, MessagesAnnotation, StateGraph } from '@langchain/langgraph';
import { ToolNode } from "@langchain/langgraph/prebuilt";
import type { AIMessage } from "@langchain/core/messages";
import { TavilySearch } from '@langchain/tavily';

// Define the tools array
const tools: any[] = [search, createEventTool, getEventTool];

//add GROQ_API_KEY in env file
const model = new ChatGroq({
    model: "openai/gpt-oss-120b",
    temperature: 0
}).bindTools(tools);

// Assistant node
async function callModel(state: typeof MessagesAnnotation.State) {
    const response = await model.invoke(state.messages);
    return { messages: [response] };
}

//Tool Node
const toolNode = new ToolNode(tools);

// Conditional Edge
function shouldContinue(state: typeof MessagesAnnotation.State) {
    //check the previous/last message from ai, if it has tool calls then go to tools node else end the graph
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
    if (lastMessage.tool_calls?.length) { //if tool calls are present in the last message of LLM/AI
        return 'tools';
    }
    return '__end__';
}

// Build the graph
const graph = new StateGraph(MessagesAnnotation)
    .addNode('assistant', callModel)
    .addNode('tools', toolNode)
    .addEdge('__start__', 'assistant')
    .addEdge('tools', 'assistant')
    .addConditionalEdges('assistant', shouldContinue, {
        __end__: END,
        tools: 'tools',
    });


// adding Memory as checkpointer to save the past messages
const checkpointer = new MemorySaver();
//making the graph runnable by compiling it & passing the checkpointer(memory) to save the past messages
const app = graph.compile({ checkpointer });   //checkpointer will save the past messages in thee memory


async function main() {
    let config = { configurable: { thread_id: '1' } };
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    while (true) {
        const userInput = await rl.question('You: ');
        if (userInput === '/bye') {
            break;
        }
        //getting the current date time in ISO format
        const currentDateTime = new Date().toLocaleString('sv-SE').replace(' ', 'T');
        //getting the current timezone string
        const timeZoneString = Intl.DateTimeFormat().resolvedOptions().timeZone;
        //invoking the graph with initial message
        const result = await app.invoke(
            {
                messages: [
                    {
                        role: 'system',
                        content: `You are a smart, proactive personal assistant. You are here to help Shiva(a GENAI-full-stack Javascript developer). Your name is 'Jarvis',Introduce yourself only when asked, Your core responsibilities are:
                        - Schedule Management – create, view, modify, and remind about calendar events.
                        - Task & TODO Tracking – capture, prioritize, and update Shiva’s to‑do items.
                        - Context‑Aware Assistance – understand Shiva’s workflow, suggest relevant resources, and anticipate needs based on his development projects.
                        Behaviour Guidelines
                        1. Introduce yourself, whenever Shiva (or anyone else) asks, using a friendly yet professional tone.
                        2. Be concise and actionable – give clear next steps or confirmations.
                        3. Leverage available tools (e.g., create-event, get-events, search) to handle calendar operations automatically & make google search when required.
                        4. Maintain privacy – never expose personal data unless explicitly requested.
                        Current datetime: ${currentDateTime}
                        Current timezone string: ${timeZoneString}`,
                    },
                    {
                        role: 'user',
                        content: userInput
                        //"Can you create a meeting with MS Dhoni(msd@gmail.com) at 4PM today about Backend discussion?"
                        //content: "Hi, Do i have any meeting today ?" 
                    }
                ],
            },
            config
        );
        console.log('AI: ', result.messages[result.messages.length - 1].content);
    }
    rl.close();
}

main();