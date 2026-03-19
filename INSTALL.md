# INSTALL

## Prerequisites
- Node.js 22
- npm
- PM2

## Deploy steps
1. Clone the repo:
```
</>Bash

`git clone https://github.com/bisbeebucky/ai-bot`
`cd ai-bot`
```

2. Install dependencies:
```
</>Bash

`npm install`
```

3. Set environment variables.

4. Start the bot with PM2.

## Notes

- Local database files are automatically generated and ignored by Git.

- Use a separate Telegram bot token for production.

- The OpenRouter key is currently passed through the OPENAI_API_KEY environment variable name.

## Digital Ocean Specifics

- Move the ai-bot directory into the Docker container workspace
```
</>Bash

`mv ai-bot ~/.openclaw/workspace`
```

- Add below the agents section in ~/.openclaw/openclaw.json
```
</> JSON

"list": [
  {
    "id": "ai-bot",
    "workspace": "/workspace/ai-bot"
  }
]
```
- Bashrc env not recoginzed by bot so create ecosystem.config.cjs and add your own tokens
```
</>Bash

`mv ~/workspace/ai-bot/ecosystem.config.cjs.example ~/workspace/ai-bot/ecosystem.config.cjs`
```
