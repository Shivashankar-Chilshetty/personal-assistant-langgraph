import { ChatGroq } from "@langchain/groq";
import { createEventTool, getEventTool } from "./tools";

const tools : any[] = [createEventTool, getEventTool];

//add GROQ_API_KEY in env file
const model = new ChatGroq({
    model: "openai/gpt-oss-120b",
    temperature: 0
}).bindTools(tools);

