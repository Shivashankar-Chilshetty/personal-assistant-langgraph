import { ChatGroq } from "@langchain/groq";

console.log("Welcome to the personal assistant!");


const tools : any[] = [];

//add GROQ_API_KEY in env file
const model = new ChatGroq({
    model: "openai/gpt-oss-120b",
    temperature: 0
}).bindTools(tools);