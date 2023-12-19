# OpenDeva
The Open AI Deva that handles deva.world calls to ChatGPT and Dall-e


{
  "type": "function",
  "function": {
    "name": "get_wiki",
    "description": "When the user talks about specific topics, public figures, politicians, or companies the summary for the data can be requested from Wikipedia for accuracy by using this function. If there are no results use your imagination.",
    "parameters": {
      "type": "object",
      "properties": {
        "type": {
          "type": "string",
          "description": "The specific type of lookup. Either summary of a specific topic or search for topics can be done.",
          "enum": ["summary", "search"]
        },
        "topic": {
          "type": "string",
          "description": "The specific topic to retrieve from wikipedia. If there are no results use your imagination."
        }
      },
      "required": ["type", "topic"]
    }
  }
},
